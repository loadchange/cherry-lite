import { DEFAULT_TTS_SETTINGS } from '@shared/tts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveSpeechVoice, TtsSessionManager } from '../TtsSessionManager'

const audio = { audio: new Uint8Array([0xff, 0xfb, 1, 2]), mimeType: 'audio/mpeg' }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

describe('TtsSessionManager', () => {
  const sendHost = vi.fn()
  const onState = vi.fn()
  const prepareHost = vi.fn<() => Promise<void>>()
  const synthesize = vi.fn().mockResolvedValue(audio)
  let manager: TtsSessionManager
  beforeEach(() => {
    vi.clearAllMocks()
    prepareHost.mockResolvedValue()
    synthesize.mockResolvedValue(audio)
    manager = new TtsSessionManager({ sendHost, onState, prepareHost, synthesize })
  })

  it('does not start a player or cloud request for code-only input', () => {
    expect(() =>
      manager.play({ text: '```js\nconst secret = 1\n```', sourceId: 'code' }, 'w', DEFAULT_TTS_SETTINGS)
    ).toThrow('No readable text')
    expect(prepareHost).not.toHaveBeenCalled()
    expect(synthesize).not.toHaveBeenCalled()
  })

  it('waits for host readiness before sending the first segment', async () => {
    const ready = deferred<void>()
    prepareHost.mockReturnValue(ready.promise)
    const state = manager.play(
      { text: '# 你好\n[世界](https://example.com)', sourceId: 'selection' },
      'toolbar',
      DEFAULT_TTS_SETTINGS
    )
    await tick()
    expect(state.status).toBe('preparing')
    expect(sendHost).not.toHaveBeenCalled()
    ready.resolve()
    await tick()
    expect(sendHost).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'segment', sessionId: state.sessionId, index: 0 })
    )
    expect(synthesize).toHaveBeenCalledWith(
      '你好\n世界',
      'zh-CN-XiaoxiaoNeural',
      'zh-CN',
      expect.any(Object),
      expect.any(AbortSignal)
    )
  })

  it('aborts the old session and discards late audio and old host events', async () => {
    const old = deferred<typeof audio>()
    synthesize.mockReturnValueOnce(old.promise)
    const first = manager.play({ text: 'First', sourceId: 'first' }, 'a', DEFAULT_TTS_SETTINGS)
    const signal = synthesize.mock.calls[0][4] as AbortSignal
    const second = manager.play({ text: 'Second', sourceId: 'second' }, 'b', DEFAULT_TTS_SETTINGS)
    await tick()
    old.resolve(audio)
    manager.hostEvent({ sessionId: first.sessionId!, index: 0, event: 'ended' })
    await tick()
    expect(signal.aborted).toBe(true)
    expect(manager.getState().sessionId).toBe(second.sessionId)
    expect(
      sendHost.mock.calls.filter(([command]) => command.type === 'segment').map(([command]) => command.sessionId)
    ).toEqual([second.sessionId])
  })

  it('can cancel while synthesis and the player are preparing', async () => {
    const pending = deferred<typeof audio>()
    synthesize.mockReturnValue(pending.promise)
    manager.play({ text: 'Loading', sourceId: 'one' }, 'a', DEFAULT_TTS_SETTINGS)
    manager.stop()
    pending.resolve(audio)
    await tick()
    expect(manager.getState()).toEqual({ status: 'idle' })
    expect(sendHost.mock.calls.some(([command]) => command.type === 'segment')).toBe(false)
  })

  it('pauses before host readiness, resumes once, and does not repeat synthesis', async () => {
    const ready = deferred<void>()
    prepareHost.mockReturnValue(ready.promise)
    const state = manager.play({ text: 'Wait', sourceId: 's' }, 'a', DEFAULT_TTS_SETTINGS)
    manager.pause()
    manager.resume()
    await tick()
    expect(sendHost.mock.calls.some(([command]) => command.type === 'segment')).toBe(false)
    ready.resolve()
    await tick()
    expect(sendHost.mock.calls.filter(([command]) => command.type === 'segment')).toHaveLength(1)
    manager.hostEvent({ sessionId: state.sessionId!, index: 0, event: 'playing' })
    manager.pause()
    manager.hostEvent({ sessionId: state.sessionId!, index: 0, event: 'playing' })
    expect(manager.getState().status).toBe('paused')
    manager.resume()
    expect(synthesize).toHaveBeenCalledTimes(1)
    expect(sendHost).toHaveBeenLastCalledWith({ type: 'resume', sessionId: state.sessionId })
  })

  it('bounds prefetch to current plus one and advances only on matching ended', async () => {
    const state = manager.play(
      { text: 'A paragraph sentence. '.repeat(500), sourceId: 'long' },
      'a',
      DEFAULT_TTS_SETTINGS
    )
    await tick()
    expect(synthesize).toHaveBeenCalledTimes(2)
    manager.hostEvent({ sessionId: state.sessionId!, index: 9, event: 'ended' })
    expect(synthesize).toHaveBeenCalledTimes(2)
    manager.hostEvent({ sessionId: state.sessionId!, index: 0, event: 'ended' })
    await tick()
    expect(manager.getState().segmentIndex).toBe(1)
    expect(sendHost.mock.calls.filter(([command]) => command.type === 'segment')).toHaveLength(2)
  })

  it('completes with idle and rejects duplicate ended notifications', async () => {
    const state = manager.play({ text: 'Done', sourceId: 'done' }, 'a', DEFAULT_TTS_SETTINGS)
    await tick()
    manager.hostEvent({ sessionId: state.sessionId!, index: 0, event: 'ended' })
    manager.hostEvent({ sessionId: state.sessionId!, index: 0, event: 'ended' })
    expect(manager.getState()).toEqual({ status: 'idle' })
  })

  it('redacts server errors and permits a new attempt', async () => {
    synthesize.mockRejectedValueOnce(new Error('API_KEY private text https://secret'))
    manager.play({ text: 'Read', sourceId: 'error' }, 'a', DEFAULT_TTS_SETTINGS)
    await tick()
    expect(manager.getState().status).toBe('error')
    expect(JSON.stringify(onState.mock.calls)).not.toMatch(/API_KEY|private text|https:\/\/secret/)
    manager.play({ text: 'Retry', sourceId: 'error' }, 'a', DEFAULT_TTS_SETTINGS)
    await tick()
    expect(manager.getState().status).toBe('preparing')
  })

  it('handles synchronous host startup failure without an unhandled rejection', async () => {
    prepareHost.mockImplementationOnce(() => {
      throw new Error('startup failed')
    })
    manager.play({ text: 'Hello', sourceId: 'error' }, 'a', DEFAULT_TTS_SETTINGS)
    await tick()
    expect(manager.getState().status).toBe('error')
  })

  it('reuses audio without storing plaintext in state and isolates voice/rate/config', async () => {
    for (const config of [
      DEFAULT_TTS_SETTINGS,
      DEFAULT_TTS_SETTINGS,
      { ...DEFAULT_TTS_SETTINGS, rate: 1.2 },
      { ...DEFAULT_TTS_SETTINGS, voice: 'en-US-AriaNeural' }
    ]) {
      manager.play({ text: 'Private spoken text', sourceId: 'cache' }, 'a', config)
      await tick()
    }
    expect(synthesize).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(onState.mock.calls)).not.toContain('Private spoken text')
    manager.dispose()
    manager.play({ text: 'Private spoken text', sourceId: 'cache' }, 'a', DEFAULT_TTS_SETTINGS)
    await tick()
    expect(synthesize).toHaveBeenCalledTimes(4)
  })

  it('uses explicit translation language and per-language voice preferences', () => {
    expect(resolveSpeechVoice({ ...DEFAULT_TTS_SETTINGS, localeVoices: { 'zh-tw': 'custom-voice' } }, 'zh-TW')).toBe(
      'custom-voice'
    )
    expect(resolveSpeechVoice({ ...DEFAULT_TTS_SETTINGS, provider: 'openai' }, 'zh-CN')).toBe('alloy')
    const state = manager.play({ text: '你好', locale: 'ja-JP', sourceId: 'translate' }, 'action', DEFAULT_TTS_SETTINGS)
    expect(state.ownerWindowId).toBe('action')
    expect(synthesize.mock.calls[0][1]).toBe('ja-JP-NanamiNeural')
  })
})
