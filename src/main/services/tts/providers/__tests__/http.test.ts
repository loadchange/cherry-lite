import { DEFAULT_TTS_SETTINGS } from '@shared/tts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { azureTtsProvider } from '../azure'
import { MAX_AUDIO_BYTES, readSpeechResponse, withSpeechTimeout } from '../common'
import { openaiTtsProvider } from '../openai'

const { customFetch } = vi.hoisted(() => ({ customFetch: vi.fn() }))
vi.mock('../../../../ai/utils/customFetch', () => ({ customFetch }))

const config = { ...DEFAULT_TTS_SETTINGS, apiKey: 'secret-key' }
const request = { text: 'Hello & 你好', voice: 'alloy', locale: 'zh-CN', rate: 1.25 }
const signal = () => new AbortController().signal
const mp3 = () => new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x04]), { headers: { 'Content-Type': 'audio/mpeg' } })

describe('speech HTTP providers', () => {
  beforeEach(() => {
    customFetch.mockReset()
  })

  it('uses the application proxy fetch and the configured OpenAI speech API', async () => {
    customFetch.mockResolvedValue(mp3())
    const result = await openaiTtsProvider.synthesize(
      request,
      { ...config, baseUrl: 'https://example.org/v1/' },
      signal()
    )
    expect(result.mimeType).toBe('audio/mpeg')
    const [url, init] = customFetch.mock.calls[0]
    expect(url).toBe('https://example.org/v1/audio/speech')
    expect(init.redirect).toBe('error')
    expect(init.headers.Authorization).toBe('Bearer secret-key')
    expect(JSON.parse(init.body)).toEqual({
      model: 'gpt-4o-mini-tts',
      input: request.text,
      voice: 'alloy',
      speed: 1.25,
      response_format: 'mp3'
    })
  })

  it('escapes Azure SSML and uses percentage rate and native authentication', async () => {
    customFetch.mockResolvedValue(mp3())
    await azureTtsProvider.synthesize(
      { ...request, voice: 'zh-CN-XiaoxiaoNeural', text: '<voice> & "hello"' },
      config,
      signal()
    )
    const [url, init] = customFetch.mock.calls[0]
    expect(url).toBe('https://eastus.tts.speech.microsoft.com/cognitiveservices/v1')
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('secret-key')
    expect(init.body).toContain('rate="+25%"')
    expect(init.body).toContain('&lt;voice&gt; &amp; &quot;hello&quot;')
  })

  it('maps an Azure voice catalog and rejects malformed responses', async () => {
    customFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ ShortName: 'voice', Locale: 'zh-CN', DisplayName: 'Test', Gender: 'Female' }]))
    )
    expect(await azureTtsProvider.listVoices(config, signal())).toEqual([
      { id: 'voice', name: 'Test', locale: 'zh-CN', gender: 'Female' }
    ])
    customFetch.mockResolvedValueOnce(new Response('<html>error</html>'))
    await expect(azureTtsProvider.listVoices(config, signal())).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [500, 'network']
  ])('sanitizes HTTP %s without echoing credentials or text', async (status, code) => {
    customFetch.mockResolvedValue(new Response('secret-key and private text', { status: Number(status) }))
    await expect(openaiTtsProvider.synthesize(request, config, signal())).rejects.toMatchObject({
      code,
      message: `TTS provider: ${code}`
    })
  })

  it('rejects an oversized response before allocating the body', async () => {
    await expect(
      readSpeechResponse(new Response('data', { headers: { 'Content-Length': String(MAX_AUDIO_BYTES + 1) } }))
    ).rejects.toMatchObject({ code: 'too-large' })
  })

  it('enforces the streamed body limit even when Content-Length is absent', async () => {
    const cancel = vi.fn()
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]))
        },
        cancel
      })
    )
    await expect(readSpeechResponse(response, 3)).rejects.toMatchObject({ code: 'too-large' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('rejects JSON disguised as MP3', async () => {
    customFetch.mockResolvedValue(
      new Response('{"error":"private text"}', { headers: { 'Content-Type': 'audio/mpeg' } })
    )
    await expect(openaiTtsProvider.synthesize(request, config, signal())).rejects.toMatchObject({
      code: 'invalid-response'
    })
  })

  it('cancels an active fetch and suppresses late audio', async () => {
    const controller = new AbortController()
    customFetch.mockImplementation(async (_url, init) => {
      controller.abort()
      expect(init.signal.aborted).toBe(true)
      return mp3()
    })
    await expect(openaiTtsProvider.synthesize(request, config, controller.signal)).rejects.toMatchObject({
      name: 'AbortError'
    })
  })

  it('has a bounded timeout and validates configuration before sending', async () => {
    await expect(
      withSpeechTimeout(
        signal(),
        (requestSignal) =>
          new Promise((_, reject) => requestSignal.addEventListener('abort', () => reject(requestSignal.reason))),
        5
      )
    ).rejects.toMatchObject({ code: 'timeout' })
    await expect(
      openaiTtsProvider.synthesize(request, { ...config, baseUrl: 'https://user:password@example.org' }, signal())
    ).rejects.toMatchObject({ code: 'invalid-config' })
    await expect(
      openaiTtsProvider.synthesize({ ...request, text: 'a'.repeat(4000) }, config, signal())
    ).rejects.toMatchObject({ code: 'too-large' })
    expect(customFetch).not.toHaveBeenCalled()
  })
})
