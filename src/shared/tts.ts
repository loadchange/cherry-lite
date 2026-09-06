/** Serializable TTS contracts. Credentials never appear in settings/state events. */
export type TtsProviderId = 'edge' | 'openai' | 'azure'
export type TtsErrorCode =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'rate-limit'
  | 'invalid-config'
  | 'invalid-response'
  | 'too-large'
  | 'player'

export interface TtsSettings {
  provider: TtsProviderId
  baseUrl: string
  region: string
  model: string
  /** Empty means select a voice locally from the text language. */
  voice: string
  localeVoices: Record<string, string>
  rate: number
  volume: number
}

export interface TtsSettingsView extends TtsSettings {
  hasApiKey: boolean
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  provider: 'edge',
  baseUrl: '',
  region: 'eastus',
  model: 'gpt-4o-mini-tts',
  voice: '',
  localeVoices: {},
  rate: 1,
  volume: 1
}

export interface TtsVoice {
  id: string
  name: string
  locale: string
  gender?: string
}

export interface TtsState {
  status: 'idle' | 'preparing' | 'playing' | 'paused' | 'error'
  sessionId?: string
  sourceId?: string
  ownerWindowId?: string
  provider?: TtsProviderId
  segmentIndex?: number
  segmentCount?: number
  /** A sanitized diagnostic, never a server response or the spoken text. */
  error?: string
  errorCode?: TtsErrorCode
}

export interface TtsPlayRequest {
  sourceId: string
  text: string
  locale?: string
}

export interface TtsControlRequest {
  action: 'pause' | 'resume' | 'stop'
  sessionId?: string
  sourceId?: string
}

export type TtsHostCommand =
  | { type: 'segment'; sessionId: string; index: number; audioBase64: string; mimeType: string; volume: number }
  | { type: 'pause' | 'resume' | 'stop'; sessionId: string }

export interface TtsHostEvent {
  sessionId: string
  index: number
  event: 'playing' | 'ended' | 'error'
}
