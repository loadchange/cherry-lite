import type { TtsProviderId } from '@shared/tts'

import { azureTtsProvider } from './azure'
import { edgeTtsProvider } from './edge'
import { openaiTtsProvider } from './openai'
import { type TtsProvider, TtsProviderError } from './types'

const providers: Record<TtsProviderId, TtsProvider> = {
  edge: edgeTtsProvider,
  openai: openaiTtsProvider,
  azure: azureTtsProvider
}

export function getTtsProvider(id: TtsProviderId): TtsProvider {
  const provider = providers[id]
  if (!provider) throw new TtsProviderError('invalid-config')
  return provider
}
