import type { TtsHostCommand, TtsHostEvent } from '@shared/tts'

type Segment = Extract<TtsHostCommand, { type: 'segment' }>
type PlaybackDependencies = {
  audio: HTMLAudioElement
  createUrl: (blob: Blob) => string
  revokeUrl: (url: string) => void
  report: (event: TtsHostEvent) => void
}

/** A single audio sink shared by every window; speech text never enters this window. */
export class AudioPlayback {
  private sessionId?: string
  private current?: Segment
  private queue: Segment[] = []
  private url?: string
  private paused = false
  private disposed = false
  private lastIndex = -1
  private generation = 0
  private playAttempt = 0
  private retiredSessions = new Set<string>()

  constructor(private readonly dependencies: PlaybackDependencies) {}

  command(command: TtsHostCommand): void {
    if (this.disposed || this.retiredSessions.has(command.sessionId)) return
    if (command.type === 'segment') {
      if (command.sessionId !== this.sessionId) {
        this.reset()
        this.sessionId = command.sessionId
      }
      if (command.index <= this.lastIndex || this.queue.some((item) => item.index === command.index)) return
      this.queue.push(command)
      this.queue.sort((a, b) => a.index - b.index)
      this.startNext()
      return
    }
    if (command.sessionId !== this.sessionId) return
    if (command.type === 'stop') {
      this.reset()
    } else if (command.type === 'pause') {
      this.paused = true
      ++this.playAttempt
      this.dependencies.audio.pause()
    } else {
      this.paused = false
      if (this.current) this.play(this.generation)
      else this.startNext()
    }
  }

  dispose(): void {
    this.disposed = true
    this.reset()
    this.retiredSessions.clear()
  }

  private startNext(): void {
    if (this.current || this.paused || !this.queue.length) return
    const segment = this.queue.shift()!
    this.current = segment
    this.lastIndex = segment.index
    const generation = ++this.generation
    const { audio, createUrl } = this.dependencies
    try {
      const bytes = Uint8Array.from(atob(segment.audioBase64), (character) => character.charCodeAt(0))
      this.url = createUrl(new Blob([bytes], { type: segment.mimeType }))
      audio.src = this.url
      audio.volume = Math.max(0, Math.min(1, segment.volume))
      audio.onplaying = () => {
        if (generation === this.generation && !this.paused) this.report('playing')
      }
      audio.onended = () => {
        if (generation !== this.generation) return
        this.report('ended')
        this.release()
        this.startNext()
      }
      audio.onerror = () => this.fail(generation)
      this.play(generation)
    } catch {
      this.fail(generation)
    }
  }

  private play(generation: number): void {
    const attempt = ++this.playAttempt
    void this.dependencies.audio.play().catch(() => {
      // pause(), replacement and disposal can reject an older play promise.
      if (!this.paused && attempt === this.playAttempt) this.fail(generation)
    })
  }

  private report(event: TtsHostEvent['event']): void {
    if (!this.current) return
    this.dependencies.report({ sessionId: this.current.sessionId, index: this.current.index, event })
  }

  private fail(generation: number): void {
    if (generation !== this.generation || !this.current) return
    this.report('error')
    this.reset()
  }

  private release(): void {
    ++this.generation
    ++this.playAttempt
    const { audio, revokeUrl } = this.dependencies
    audio.onplaying = null
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    if (this.url) revokeUrl(this.url)
    this.url = undefined
    this.current = undefined
  }

  private reset(): void {
    this.release()
    if (this.sessionId) {
      this.retiredSessions.add(this.sessionId)
      if (this.retiredSessions.size > 32) this.retiredSessions.delete(this.retiredSessions.values().next().value!)
    }
    this.sessionId = undefined
    this.queue = []
    this.paused = false
    this.lastIndex = -1
  }
}
