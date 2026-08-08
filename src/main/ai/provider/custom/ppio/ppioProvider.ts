import { OpenAICompatibleChatLanguageModel, OpenAICompatibleEmbeddingModel } from '@ai-sdk/openai-compatible'
import { type EmbeddingModelV3, type LanguageModelV3, NoSuchModelError, type ProviderV3 } from '@ai-sdk/provider'
import type { FetchFunction } from '@ai-sdk/provider-utils'
import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils'

export const PPIO_PROVIDER_NAME = 'ppio' as const

export interface PpioProviderSettings {
  apiKey?: string
  /** Chat / embedding endpoint (e.g. `https://api.ppinfra.com/v3/openai`). */
  baseURL?: string
  headers?: Record<string, string>
  fetch?: FetchFunction
}

export interface PpioProvider extends ProviderV3 {
  (modelId: string): LanguageModelV3
  languageModel(modelId: string): LanguageModelV3
  embeddingModel(modelId: string): EmbeddingModelV3
}

/**
 * Unified PPIO provider — chat and embedding off one `ProviderV3`, mirroring
 * `newapi-provider.ts`. Chat/embedding go through the OpenAI-compatible SDK
 * aimed at `settings.baseURL`.
 */
export function createPpioProvider(settings: PpioProviderSettings = {}): PpioProvider {
  const { baseURL, fetch: customFetch } = settings
  if (!baseURL) {
    throw new Error(
      'PPIO provider requires a non-empty `baseURL`. An empty value would resolve fetch paths against the renderer process origin (app://, file://) and surface as opaque "Failed to fetch" errors.'
    )
  }

  const resolveApiKey = () =>
    loadApiKey({ apiKey: settings.apiKey, environmentVariableName: 'PPIO_API_KEY', description: 'PPIO' })

  const authHeaders = () => ({
    Authorization: `Bearer ${resolveApiKey()}`,
    ...settings.headers
  })

  const url = ({ path }: { path: string; modelId: string }) => `${withoutTrailingSlash(baseURL)}${path}`

  const createChatModel = (modelId: string) =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `${PPIO_PROVIDER_NAME}.chat`,
      url,
      headers: authHeaders,
      fetch: customFetch
    })

  const provider = (modelId: string) => createChatModel(modelId)
  provider.specificationVersion = 'v3' as const
  provider.languageModel = createChatModel
  provider.embeddingModel = (modelId: string) =>
    new OpenAICompatibleEmbeddingModel(modelId, {
      provider: `${PPIO_PROVIDER_NAME}.embedding`,
      url,
      headers: authHeaders,
      fetch: customFetch
    })

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' })
  }

  return provider as PpioProvider
}
