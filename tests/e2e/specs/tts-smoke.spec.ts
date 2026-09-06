import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

/** Opt-in: uses an isolated profile and sends only this test's public sample to Edge. */
test('TTS plays through the real Electron audio host and supports scoped controls', async () => {
  test.skip(process.env.TTS_E2E_REAL_NETWORK !== '1', 'Opt in to an actual Microsoft Edge synthesis request')
  test.setTimeout(60_000)
  const profile = await mkdtemp(join(tmpdir(), 'cherry-tts-e2e-'))
  console.log(`TTS smoke artifacts: ${profile}`)
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${join(profile, 'profile')}`],
    env: { ...process.env, NODE_ENV: 'test', CS_DEV_USER_DATA_SUFFIX: '-tts-smoke' },
    timeout: 30_000
  })
  try {
    const main =
      app.windows().find((page) => page.url().includes('windows/main/index.html')) ??
      (await app.waitForEvent('window', { predicate: (page) => page.url().includes('windows/main/index.html') }))
    await main.waitForFunction(() => !!window.api?.ipcApi)
    main.on('console', (message) => {
      if (message.text().startsWith('TTS smoke state:')) console.log(message.text())
    })
    await main.evaluate(() =>
      window.api.ipcApi.on('tts.state', (state) => console.log('TTS smoke state:', JSON.stringify(state)))
    )
    const initial = await main.evaluate(() => window.api.ipcApi.request('tts.get_state'))
    expect(initial).toMatchObject({ ok: true, data: { status: 'idle' } })
    const impostor = await main.evaluate(() => window.api.ipcApi.request('tts.host_ready'))
    expect(impostor).toMatchObject({ ok: false })

    const hostPromise = app.waitForEvent('window', {
      predicate: (page) => page.url().includes('windows/audioHost/index.html')
    })
    const started = await main.evaluate(() =>
      window.api.ipcApi.request('tts.play', {
        sourceId: 'e2e-public-sample',
        text: '你好，这是 Cherry Lite 的朗读测试。我们正在验证音频播放、暂停和继续。Hello, this is a public read aloud test.'
      })
    )
    expect(started).toMatchObject({ ok: true, data: { status: 'preparing' } })
    const host = await hostPromise
    await expect
      .poll(
        async () =>
          main.evaluate(async () => {
            const result = (await window.api.ipcApi.request('tts.get_state')) as { data: { status: string } }
            return result.data.status
          }),
        { timeout: 30_000 }
      )
      .toBe('playing')
    await host.screenshot({ path: join(profile, 'audio-host.png') })

    await main.evaluate(() =>
      window.api.ipcApi.request('tts.control', { action: 'pause', sourceId: 'e2e-public-sample' })
    )
    expect(await main.evaluate(() => window.api.ipcApi.request('tts.get_state'))).toMatchObject({
      ok: true,
      data: { status: 'paused' }
    })
    if (process.env.TTS_E2E_INSPECT === '1') {
      // Optional local visual/AX inspection while the independently hosted audio is paused.
      await host.waitForTimeout(30_000)
    }
    await main.evaluate(() =>
      window.api.ipcApi.request('tts.control', { action: 'resume', sourceId: 'e2e-public-sample' })
    )
    await expect
      .poll(async () =>
        main.evaluate(async () => {
          const result = (await window.api.ipcApi.request('tts.get_state')) as { data: { status: string } }
          return result.data.status
        })
      )
      .toBe('playing')

    // A scoped cleanup for another source must not interrupt the current one.
    await main.evaluate(() => window.api.ipcApi.request('tts.control', { action: 'stop', sourceId: 'unrelated' }))
    expect(await main.evaluate(() => window.api.ipcApi.request('tts.get_state'))).toMatchObject({
      ok: true,
      data: { status: 'playing' }
    })
    await host.getByRole('button', { name: /停止|Stop/ }).click()
    expect(await main.evaluate(() => window.api.ipcApi.request('tts.get_state'))).toMatchObject({
      ok: true,
      data: { status: 'idle' }
    })
    console.log(`TTS smoke artifacts: ${profile}`)
  } finally {
    await app.close()
  }
})
