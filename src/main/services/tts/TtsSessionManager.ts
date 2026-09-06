import { createHash, randomUUID } from 'node:crypto'

import type { TtsErrorCode, TtsHostCommand, TtsHostEvent, TtsPlayRequest, TtsSettings, TtsState } from '@shared/tts'

import { getTtsProvider, type TtsProviderConfig, TtsProviderError } from './providers'
import { cleanSpeechText, detectSpeechLocale, splitSpeechText } from './text'

type AudioSegment = { audio: Uint8Array; mimeType: string }
type SegmentResult = { segment: AudioSegment } | { error: unknown }
interface Session {
  id: string
  controller: AbortController
  chunks: string[]
  index: number
  sentIndex: number
  paused: boolean
  config: TtsProviderConfig
  voice: string
  locale: string
  pending: Map<number, Promise<SegmentResult>>
  hostReady: Promise<void>
}

export interface TtsSessionDependencies {
  prepareHost: () => Promise<void>
  sendHost: (command: TtsHostCommand) => void
  onState: (state: TtsState) => void
  synthesize?: (
    text: string,
    voice: string,
    locale: string,
    config: TtsProviderConfig,
    signal: AbortSignal
  ) => Promise<AudioSegment>
}

export function resolveSpeechVoice(settings: TtsSettings, locale: string): string {
  const normalized = locale.toLowerCase()
  const language = normalized.split('-')[0]
  const configured =
    Object.entries(settings.localeVoices).find(([key]) => key.toLowerCase() === normalized)?.[1] ||
    settings.localeVoices[language]
  if (configured || settings.voice) return configured || settings.voice
  if (settings.provider === 'openai') return 'alloy'
  if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk'))
    return normalized.startsWith('zh-hk') ? 'zh-HK-HiuMaanNeural' : 'zh-TW-HsiaoChenNeural'
  const voices: Record<string, string> = {
    zh: 'zh-CN-XiaoxiaoNeural',
    en: 'en-US-JennyNeural',
    ja: 'ja-JP-NanamiNeural',
    ko: 'ko-KR-SunHiNeural',
    fr: 'fr-FR-DeniseNeural',
    de: 'de-DE-KatjaNeural',
    es: 'es-ES-ElviraNeural',
    it: 'it-IT-ElsaNeural',
    pt: 'pt-BR-FranciscaNeural',
    ru: 'ru-RU-SvetlanaNeural',
    ar: 'ar-SA-ZariyahNeural',
    hi: 'hi-IN-SwaraNeural',
    th: 'th-TH-PremwadeeNeural'
  }
  return voices[language] || 'en-US-JennyNeural'
}

/** Global single-session coordinator. No Electron or DOM playback dependencies. */
export class TtsSessionManager {
  private snapshot: TtsState = { status: 'idle' }
  private current?: Session
  private readonly cache = new Map<string, AudioSegment>()
  private cacheBytes = 0

  constructor(private readonly dependencies: TtsSessionDependencies) {}

  getState(): TtsState {
    return { ...this.snapshot }
  }

  play(request: TtsPlayRequest, ownerWindowId: string, config: TtsProviderConfig): TtsState {
    const text = cleanSpeechText(request.text)
    if (!text.trim()) throw new Error('No readable text. Code, formulas and attachments are not read aloud.')
    const provider = getTtsProvider(config.provider)
    const chunks = splitSpeechText(text, Math.min(1800, provider.capabilities.maxTextBytes))
    if (!chunks.length) throw new Error('No readable text.')
    this.stop()
    const locale = request.locale && request.locale !== 'auto' ? request.locale : detectSpeechLocale(text)
    const session: Session = {
      id: randomUUID(),
      controller: new AbortController(),
      chunks,
      index: 0,
      sentIndex: -1,
      paused: false,
      config: structuredClone(config),
      voice: resolveSpeechVoice(config, locale),
      locale,
      pending: new Map(),
      hostReady: Promise.resolve()
    }
    this.current = session
    this.publish({
      status: 'preparing',
      sessionId: session.id,
      sourceId: request.sourceId,
      ownerWindowId,
      provider: config.provider,
      segmentIndex: 0,
      segmentCount: chunks.length
    })
    // Attach rejection handling immediately; neither host startup nor prefetch may reject unobserved.
    session.hostReady = Promise.resolve().then(() => {
      session.controller.signal.throwIfAborted()
      return this.dependencies.prepareHost()
    })
    this.prefetch(session)
    void this.deliver(session)
    return this.getState()
  }

  private publish(state: TtsState): void {
    this.snapshot = state
    this.dependencies.onState(this.getState())
  }

  stop(): void {
    const current = this.current
    this.current = undefined
    if (current) {
      current.controller.abort()
      current.pending.clear()
      this.dependencies.sendHost({ type: 'stop', sessionId: current.id })
    }
    if (this.snapshot.status !== 'idle') this.publish({ status: 'idle' })
  }

  pause(): void {
    const current = this.current
    if (!current || current.paused) return
    current.paused = true
    this.dependencies.sendHost({ type: 'pause', sessionId: current.id })
    this.publish({ ...this.snapshot, status: 'paused' })
  }

  resume(): void {
    const current = this.current
    if (!current || !current.paused) return
    current.paused = false
    this.publish({ ...this.snapshot, status: 'preparing' })
    if (current.sentIndex === current.index) {
      this.dependencies.sendHost({ type: 'resume', sessionId: current.id })
    } else {
      void this.deliver(current)
    }
  }

  hostEvent(event: TtsHostEvent): void {
    const current = this.current
    if (
      !current ||
      event.sessionId !== current.id ||
      event.index !== current.index ||
      current.sentIndex !== event.index
    )
      return
    if (event.event === 'error') {
      this.fail(current, new Error('Audio playback failed. Check your output device and try again.'), 'player')
    } else if (event.event === 'playing') {
      if (!current.paused) this.publish({ ...this.snapshot, status: 'playing' })
    } else {
      current.pending.delete(current.index)
      current.index++
      if (current.index >= current.chunks.length) {
        this.stop()
        return
      }
      this.publish({ ...this.snapshot, segmentIndex: current.index, status: current.paused ? 'paused' : 'preparing' })
      this.prefetch(current)
      void this.deliver(current)
    }
  }

  hostFailed(): void {
    if (this.current)
      this.fail(this.current, new Error('The audio player could not start. Try reading aloud again.'), 'player')
  }

  private prefetch(session: Session): void {
    // Current segment plus exactly one ahead, including while paused.
    for (let index = session.index; index < Math.min(session.index + 2, session.chunks.length); index++) {
      if (session.pending.has(index)) continue
      session.pending.set(
        index,
        this.synthesize(session, index).then(
          (segment) => ({ segment }),
          (error: unknown) => ({ error })
        )
      )
    }
  }

  private async synthesize(session: Session, index: number): Promise<AudioSegment> {
    const text = session.chunks[index]
    const audioConfig = { ...session.config, volume: undefined }
    const key = createHash('sha256')
      .update(JSON.stringify([audioConfig, session.voice, session.locale, text]))
      .digest('hex')
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return cached
    }
    const segment = this.dependencies.synthesize
      ? await this.dependencies.synthesize(
          text,
          session.voice,
          session.locale,
          session.config,
          session.controller.signal
        )
      : await getTtsProvider(session.config.provider).synthesize(
          {
            text,
            voice: session.voice,
            locale: session.locale,
            rate: session.config.rate,
            model: session.config.model
          },
          session.config,
          session.controller.signal
        )
    session.controller.signal.throwIfAborted()
    if (!segment.audio.byteLength || segment.audio.byteLength > 16 * 1024 * 1024)
      throw new Error('Invalid TTS audio size')
    // 32 MiB, at most 64 entries. Text and credentials are only hashed, never logged.
    while (
      this.cache.size &&
      (this.cache.size >= 64 || this.cacheBytes + segment.audio.byteLength > 32 * 1024 * 1024)
    ) {
      const oldest = this.cache.keys().next().value!
      this.cacheBytes -= this.cache.get(oldest)!.audio.byteLength
      this.cache.delete(oldest)
    }
    const previous = this.cache.get(key)
    if (previous) this.cacheBytes -= previous.audio.byteLength
    this.cache.set(key, segment)
    this.cacheBytes += segment.audio.byteLength
    return segment
  }

  private async deliver(session: Session): Promise<void> {
    const index = session.index
    try {
      const [result] = await Promise.all([session.pending.get(index)!, session.hostReady])
      if (this.current !== session || session.index !== index || session.sentIndex === index) return
      if ('error' in result) throw result.error
      if (session.paused) return
      session.sentIndex = index
      this.dependencies.sendHost({
        type: 'segment',
        sessionId: session.id,
        index,
        audioBase64: Buffer.from(result.segment.audio).toString('base64'),
        mimeType: result.segment.mimeType,
        volume: session.config.volume
      })
    } catch (error) {
      if (this.current === session) this.fail(session, error)
    }
  }

  private fail(session: Session, error: unknown, code?: TtsErrorCode): void {
    if (this.current !== session) return
    this.current = undefined
    session.controller.abort()
    session.pending.clear()
    this.dependencies.sendHost({ type: 'stop', sessionId: session.id })
    // Do not forward arbitrary server errors: some services echo text, headers or API keys.
    this.publish({
      ...this.snapshot,
      status: 'error',
      errorCode: code ?? (error instanceof TtsProviderError ? error.code : 'network'),
      error:
        'Read aloud failed. Check your network, voice and API credentials in Read Aloud settings, then retry. Microsoft Edge availability may change; you can switch providers.'
    })
  }

  dispose(): void {
    this.stop()
    this.cache.clear()
    this.cacheBytes = 0
  }
}
