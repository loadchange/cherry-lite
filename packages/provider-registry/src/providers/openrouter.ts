import { CURRENCY } from '../schemas/enums'
import { defineProvider } from './types'
import { EFFORT, modeWire } from './wires'

export default defineProvider({
  id: 'openrouter',
  name: 'OpenRouter',
  // OpenRouter's usage response carries the actual billed amount, so the cost
  // engine trusts it over locally computed pricing.
  apiFeatures: {
    reportsActualCost: true
  },
  reportedCostCurrency: CURRENCY.USD,
  defaultChatEndpoint: 'openai-chat-completions',
  endpointConfigs: {
    'anthropic-messages': {
      adapterFamily: 'anthropic',
      baseUrl: 'https://openrouter.ai/api'
    },
    'openai-chat-completions': {
      adapterFamily: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1/',
      reasoningFormat: {
        type: 'openai-chat',
        wire: modeWire('reasoning.effort', { off: 'none', auto: EFFORT, effort: EFFORT }, { autoEffort: 'medium' })
      },
      modelsApiUrls: {
        default: 'https://openrouter.ai/api/v1/models',
        embedding: 'https://openrouter.ai/api/v1/embeddings/models',
        image: 'https://openrouter.ai/api/v1/images/models'
      }
    },
    'openai-image-generation': {
      adapterFamily: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1/'
    }
  },
  serverTools: [
    { id: 'web-search', modelScope: 'all-chat-models' },
    { id: 'url-context', modelScope: 'all-chat-models' }
  ],
  metadata: {
    website: {
      apiKey: 'https://openrouter.ai/settings/keys',
      docs: 'https://openrouter.ai/docs/quick-start',
      models: 'https://openrouter.ai/models',
      official: 'https://openrouter.ai/'
    }
  },
  modelsDevProvider: 'openrouter',
  overrides: [
    // OpenRouter owns this moving router alias; DeepSeek does not publish it as
    // a model. Actual usage cost is authoritative, so omit a static alias price.
    { modelId: 'deepseek-v4-flash-latest', name: 'DeepSeek V4 Flash Latest', pricing: undefined }
  ]
})
