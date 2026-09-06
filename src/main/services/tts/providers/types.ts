import type { TtsSettings, TtsVoice } from '@shared/tts'

export type TtsProviderConfig = TtsSettings & { apiKey?: string }

export interface TtsSynthesisRequest {
  text: string
  voice: string
  locale: string
  rate: number
  model?: string
}

export interface TtsAudio {
  audio: Uint8Array
  mimeType: string
}

export interface TtsProvider {
  capabilities: { maxTextBytes: number; voices: boolean; rate: boolean; ssml: boolean }
  listVoices(config: TtsProviderConfig, signal: AbortSignal): Promise<TtsVoice[]>
  synthesize(request: TtsSynthesisRequest, config: TtsProviderConfig, signal: AbortSignal): Promise<TtsAudio>
}

export class TtsProviderError extends Error {
  constructor(
    public readonly code:
      | 'network'
      | 'timeout'
      | 'auth'
      | 'rate-limit'
      | 'invalid-config'
      | 'invalid-response'
      | 'too-large'
  ) {
    super(`TTS provider: ${code}`)
    this.name = 'TtsProviderError'
  }
}
