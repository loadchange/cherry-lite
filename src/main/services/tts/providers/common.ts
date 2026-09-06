import type { TtsVoice } from '@shared/tts'

import { escapeSpeechXml } from '../text'
import { TtsProviderError, type TtsSynthesisRequest } from './types'

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024
export const REQUEST_TIMEOUT_MS = 45_000

/** Import lazily: the application proxy policy belongs to Electron's default session. */
export const speechFetch: typeof fetch = async (input, init) => {
  const { customFetch } = await import('../../../ai/utils/customFetch')
  return customFetch(input, init)
}

export async function withSpeechTimeout<T>(
  signal: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
  signal.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new TtsProviderError('timeout')), timeoutMs)
  timer.unref?.()
  try {
    const result = await run(controller.signal)
    controller.signal.throwIfAborted()
    return result
  } catch (error) {
    if (signal.aborted) throw new DOMException('Speech canceled', 'AbortError')
    if (controller.signal.aborted) throw new TtsProviderError('timeout')
    if (error instanceof TtsProviderError) throw error
    // Provider bodies, URLs and raw socket errors can contain credentials or input text.
    throw new TtsProviderError('network')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export function assertSpeechRequest(request: TtsSynthesisRequest, maxBytes: number, ssml = false): void {
  if (
    !request.text.trim() ||
    !request.voice.trim() ||
    !Number.isFinite(request.rate) ||
    request.rate < 0.5 ||
    request.rate > 2
  ) {
    throw new TtsProviderError('invalid-config')
  }
  if (request.voice.length > 200 || request.locale.length > 40) throw new TtsProviderError('invalid-config')
  if (Buffer.byteLength(ssml ? escapeSpeechXml(request.text) : request.text, 'utf8') > maxBytes) {
    throw new TtsProviderError('too-large')
  }
}

export function speechSsml(request: TtsSynthesisRequest): string {
  const rate = Math.round((request.rate - 1) * 100)
  const prosodyRate = `${rate >= 0 ? '+' : ''}${rate}%`
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeSpeechXml(request.locale)}"><voice name="${escapeSpeechXml(request.voice)}"><prosody pitch="+0Hz" rate="${prosodyRate}" volume="+0%">${escapeSpeechXml(request.text)}</prosody></voice></speak>`
}

export function requireApiKey(key: string | undefined): string {
  if (!key?.trim() || /[\r\n]/.test(key)) throw new TtsProviderError('auth')
  return key.trim()
}

export function endpointUrl(base: string, suffix: string): string {
  try {
    const url = new URL(base)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid endpoint')
    }
    const path = url.pathname.replace(/\/+$/, '')
    url.pathname = path.endsWith(suffix) ? path : `${path}${suffix}`
    return url.href
  } catch {
    throw new TtsProviderError('invalid-config')
  }
}

export async function readSpeechResponse(response: Response, maxBytes = MAX_AUDIO_BYTES): Promise<Uint8Array> {
  if (!response.ok) {
    void response.body?.cancel().catch(() => {})
    throw new TtsProviderError(
      response.status === 401 || response.status === 403 ? 'auth' : response.status === 429 ? 'rate-limit' : 'network'
    )
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    void response.body?.cancel().catch(() => {})
    throw new TtsProviderError('too-large')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new TtsProviderError('invalid-response')
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new TtsProviderError('too-large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (!total) throw new TtsProviderError('invalid-response')
  return Buffer.concat(chunks, total)
}

export async function readMp3Response(response: Response): Promise<{ audio: Uint8Array; mimeType: string }> {
  const audio = await readSpeechResponse(response)
  const type = response.headers.get('content-type')?.split(';')[0].toLowerCase()
  if (type && !['audio/mpeg', 'audio/mp3', 'audio/x-mp3', 'application/octet-stream'].includes(type)) {
    throw new TtsProviderError('invalid-response')
  }
  // Reject successful JSON/HTML error bodies even when a gateway lies about Content-Type.
  if (
    !(audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) &&
    !(audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
  ) {
    throw new TtsProviderError('invalid-response')
  }
  return { audio, mimeType: 'audio/mpeg' }
}

export function parseMicrosoftVoices(data: Uint8Array): TtsVoice[] {
  let rows: unknown
  try {
    rows = JSON.parse(new TextDecoder().decode(data))
  } catch {
    throw new TtsProviderError('invalid-response')
  }
  if (!Array.isArray(rows)) throw new TtsProviderError('invalid-response')
  return rows.flatMap((row) => {
    if (!row || typeof row.ShortName !== 'string' || typeof row.Locale !== 'string') return []
    return [
      {
        id: row.ShortName,
        name: String(row.FriendlyName ?? row.LocalName ?? row.DisplayName ?? row.ShortName),
        locale: row.Locale,
        ...(typeof row.Gender === 'string' ? { gender: row.Gender } : {})
      }
    ]
  })
}
