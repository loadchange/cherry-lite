import {
  assertSpeechRequest,
  endpointUrl,
  readMp3Response,
  requireApiKey,
  speechFetch,
  withSpeechTimeout
} from './common'
import type { TtsProvider } from './types'

const VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar'
]

export const openaiTtsProvider: TtsProvider = {
  capabilities: { maxTextBytes: 3000, voices: false, rate: true, ssml: false },
  async listVoices(_config, signal) {
    signal.throwIfAborted()
    // OpenAI has no standard speech-voice listing endpoint. Custom voice IDs remain supported.
    return VOICES.map((id) => ({ id, name: id, locale: 'multilingual' }))
  },
  async synthesize(request, config, signal) {
    assertSpeechRequest(request, this.capabilities.maxTextBytes)
    const key = requireApiKey(config.apiKey)
    const endpoint = endpointUrl(config.baseUrl || 'https://api.openai.com/v1', '/audio/speech')
    return withSpeechTimeout(signal, async (requestSignal) => {
      const response = await speechFetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: requestSignal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || config.model || 'gpt-4o-mini-tts',
          input: request.text,
          voice: request.voice,
          speed: request.rate,
          response_format: 'mp3'
        })
      })
      return readMp3Response(response)
    })
  }
}
