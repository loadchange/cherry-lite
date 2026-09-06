import { createHash, randomBytes, randomUUID } from 'node:crypto'

import WebSocket, { type ClientOptions, type RawData } from 'ws'

import {
  assertSpeechRequest,
  MAX_AUDIO_BYTES,
  parseMicrosoftVoices,
  readSpeechResponse,
  REQUEST_TIMEOUT_MS,
  speechFetch,
  speechSsml,
  withSpeechTimeout
} from './common'
import { type TtsAudio, type TtsProvider, TtsProviderError, type TtsSynthesisRequest } from './types'

// Edge Read Aloud protocol identifiers, publicly sent by the browser (not user credentials).
// Protocol reference: https://github.com/rany2/edge-tts ; no library code is vendored.
const CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const EDGE_VERSION = '143.0.3650.75'
const HOST = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'

export function edgeSecurityToken(now: number): string {
  const windowsSeconds = BigInt(Math.floor(now / 1000)) + 11644473600n
  const roundedTicks = (windowsSeconds / 300n) * 300n * 10000000n
  return createHash('sha256').update(`${roundedTicks}${CLIENT_TOKEN}`).digest('hex').toUpperCase()
}

function edgeTimestamp(now: number): string {
  const parts = new Date(now).toUTCString().split(' ')
  return `${parts[0].slice(0, 3)} ${parts[2]} ${parts[1]} ${parts[3]} ${parts[4]} GMT+0000 (Coordinated Universal Time)`
}

export function parseEdgeAudioFrame(data: Uint8Array): Uint8Array | null {
  const frame = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  if (frame.length < 2) throw new TtsProviderError('invalid-response')
  const headerLength = frame.readUInt16BE(0)
  if (headerLength > frame.length - 2) throw new TtsProviderError('invalid-response')
  const headers = frame.subarray(2, headerLength + 2).toString('utf8')
  if (!/(?:^|\r\n)Path:audio(?:\r\n|$)/i.test(headers)) throw new TtsProviderError('invalid-response')
  const audio = frame.subarray(headerLength + 2)
  if (!audio.length) return null
  if (!/(?:^|\r\n)Content-Type:audio\/mpeg(?:\r\n|$)/i.test(headers)) throw new TtsProviderError('invalid-response')
  return audio
}

type EdgeOptions = {
  connect?: (url: string, options: ClientOptions) => WebSocket
  now?: () => number
  timeoutMs?: number
}

class EdgeHandshakeError extends TtsProviderError {
  constructor(readonly serverDate?: number) {
    super('auth')
  }
}

function rawBuffer(data: RawData): Buffer {
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)
}

export function createEdgeTtsProvider(options: EdgeOptions = {}): TtsProvider {
  const now = options.now ?? Date.now
  const connect = options.connect ?? ((url, config) => new WebSocket(url, config))

  async function synthesizeOnce(
    request: TtsSynthesisRequest,
    signal: AbortSignal,
    clockOffset: number
  ): Promise<TtsAudio> {
    signal.throwIfAborted()
    const timestamp = now() + clockOffset
    const connectionId = randomUUID().replaceAll('-', '')
    const url = `wss://${HOST}/edge/v1?TrustedClientToken=${CLIENT_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${edgeSecurityToken(timestamp)}&Sec-MS-GEC-Version=1-${EDGE_VERSION}`
    return new Promise((resolve, reject) => {
      const socket = connect(url, {
        handshakeTimeout: 15_000,
        maxPayload: MAX_AUDIO_BYTES,
        followRedirects: false,
        // ws calls the Node http(s).request methods at connection time. The app's
        // NodeProxyController supplies HTTP/SOCKS routing and proxy-env bypasses.
        headers: {
          'User-Agent': USER_AGENT,
          Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: `muid=${randomBytes(16).toString('hex').toUpperCase()};`
        }
      })
      let settled = false
      let total = 0
      const chunks: Uint8Array[] = []
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        // Keep the error listener through teardown: terminate() while CONNECTING emits an error.
        socket.terminate()
        if (error) reject(error)
        else if (!total) reject(new TtsProviderError('invalid-response'))
        else resolve({ audio: Buffer.concat(chunks, total), mimeType: 'audio/mpeg' })
      }
      const abort = () => finish(new DOMException('Speech canceled', 'AbortError'))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()

      socket.on('error', () => finish(new TtsProviderError('network')))
      socket.on('close', () => finish(new TtsProviderError('invalid-response')))
      socket.on('unexpected-response', (_req, response) => {
        const status = response.statusCode
        const serverDate = response.headers.date ? Date.parse(response.headers.date) : undefined
        response.destroy()
        finish(
          status === 403
            ? new EdgeHandshakeError(serverDate)
            : new TtsProviderError(status === 429 ? 'rate-limit' : 'network')
        )
      })
      socket.on('open', () => {
        if (settled) return
        const stamp = edgeTimestamp(timestamp)
        socket.send(
          `X-Timestamp:${stamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } })}\r\n`
        )
        socket.send(
          `X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp}Z\r\nPath:ssml\r\n\r\n${speechSsml(request)}`
        )
      })
      socket.on('message', (data, binary) => {
        if (settled) return
        try {
          const buffer = rawBuffer(data)
          if (!binary) {
            if (/(?:^|\r\n)Path:turn.end(?:\r\n|$)/i.test(buffer.toString('utf8'))) finish()
            return
          }
          const audio = parseEdgeAudioFrame(buffer)
          if (!audio) return
          total += audio.byteLength
          if (total > MAX_AUDIO_BYTES) throw new TtsProviderError('too-large')
          chunks.push(audio)
        } catch {
          finish(new TtsProviderError(total > MAX_AUDIO_BYTES ? 'too-large' : 'invalid-response'))
        }
      })
    })
  }

  return {
    capabilities: { maxTextBytes: 3000, voices: true, rate: true, ssml: true },
    async listVoices(_config, signal) {
      const endpoint = `https://${HOST}/voices/list?trustedclienttoken=${CLIENT_TOKEN}&Sec-MS-GEC=${edgeSecurityToken(now())}&Sec-MS-GEC-Version=1-${EDGE_VERSION}`
      return withSpeechTimeout(signal, async (requestSignal) => {
        const response = await speechFetch(endpoint, {
          signal: requestSignal,
          redirect: 'error',
          headers: { 'User-Agent': USER_AGENT }
        })
        return parseMicrosoftVoices(await readSpeechResponse(response, 2 * 1024 * 1024))
      })
    },
    async synthesize(request, _config, signal) {
      assertSpeechRequest(request, this.capabilities.maxTextBytes, true)
      return withSpeechTimeout(
        signal,
        async (requestSignal) => {
          try {
            return await synthesizeOnce(request, requestSignal, 0)
          } catch (error) {
            if (!(error instanceof EdgeHandshakeError) || !error.serverDate || !Number.isFinite(error.serverDate))
              throw error
            requestSignal.throwIfAborted()
            // One retry only, using the TLS-authenticated service's clock for its token window.
            return synthesizeOnce(request, requestSignal, error.serverDate - now())
          }
        },
        options.timeoutMs ?? REQUEST_TIMEOUT_MS
      )
    }
  }
}

export const edgeTtsProvider = createEdgeTtsProvider()
