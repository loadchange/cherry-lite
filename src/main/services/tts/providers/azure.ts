import {
  assertSpeechRequest,
  endpointUrl,
  parseMicrosoftVoices,
  readMp3Response,
  readSpeechResponse,
  requireApiKey,
  speechFetch,
  speechSsml,
  withSpeechTimeout
} from './common'
import { type TtsProvider, type TtsProviderConfig, TtsProviderError } from './types'

function azureEndpoint(config: TtsProviderConfig, path: string): string {
  if (!config.baseUrl && !/^[a-z][a-z0-9-]{1,39}$/.test(config.region)) throw new TtsProviderError('invalid-config')
  const base = config.baseUrl || `https://${config.region}.tts.speech.microsoft.com`
  // Accept a Speech synthesis URL as well as the regional resource root.
  return endpointUrl(base.replace(/\/cognitiveservices\/v1\/?$/, ''), path)
}

export const azureTtsProvider: TtsProvider = {
  capabilities: { maxTextBytes: 3000, voices: true, rate: true, ssml: true },
  async listVoices(config, signal) {
    const key = requireApiKey(config.apiKey)
    const endpoint = azureEndpoint(config, '/cognitiveservices/voices/list')
    return withSpeechTimeout(signal, async (requestSignal) => {
      const response = await speechFetch(endpoint, {
        signal: requestSignal,
        redirect: 'error',
        headers: { 'Ocp-Apim-Subscription-Key': key }
      })
      return parseMicrosoftVoices(await readSpeechResponse(response, 2 * 1024 * 1024))
    })
  },
  async synthesize(request, config, signal) {
    assertSpeechRequest(request, this.capabilities.maxTextBytes, true)
    const key = requireApiKey(config.apiKey)
    const endpoint = azureEndpoint(config, '/cognitiveservices/v1')
    return withSpeechTimeout(signal, async (requestSignal) => {
      const response = await speechFetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: requestSignal,
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'Cherry-Lite-TTS'
        },
        body: speechSsml(request)
      })
      return readMp3Response(response)
    })
  }
}
