import { definePlugin } from '@cherrystudio/ai-core'
import { ENDPOINT_TYPE } from '@shared/data/types/model'

import { getReasoningTagName } from '../../../../utils/reasoning'
import type { RequestFeature } from '../feature'
import { createAnchoredReasoningExtraction } from './reasoningExtractionMiddleware'

/**
 * Reasoning Extraction Plugin — moves the leading inline `<tag>…</tag>` block
 * of the openai-style `text` channel into `reasoning-delta` chunks.
 *
 */
const createReasoningExtractionPlugin = (options: { tagName?: string } = {}) =>
  definePlugin({
    name: 'reasoning-extraction',
    enforce: 'pre',

    configureContext: (context) => {
      context.middlewares = context.middlewares || []
      context.middlewares.push(createAnchoredReasoningExtraction(options.tagName || 'thinking'))
    }
  })

/**
 * Must run BEFORE simulateStreaming so that after `wrapLanguageModel`
 * reverses the middleware chain, reasoning extraction wraps simulateStreaming
 * and resolves unclosed ` thinking` tags produced by the simulated stream.
 *
 * The extraction itself is anchored (see `reasoningExtractionMiddleware`): a tag that is not the
 * start of the reply, or a reply whose wire already streamed structured reasoning, stays content.
 *
 * Applies only on the `openai-chat-completions` wire. That wire has no native reasoning field, so a
 * reasoning model served over it emits its chain inline as `<tag>…</tag>` in the
 * text channel — this covers third-party models behind a bespoke-family gateway
 * (e.g. AiHubMix's compat route) and native chat-completions providers
 * (groq, mistral, …) alike. Endpoints with a native
 * reasoning channel (anthropic-messages / google / openai-responses) are left
 * untouched, so a literal `<tag>` there stays real content.
 */
export const reasoningExtractionFeature: RequestFeature = {
  name: 'reasoning-extraction',
  applies: (scope) => scope.endpointType === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  contributeModelAdapters: (scope) => [
    createReasoningExtractionPlugin({ tagName: getReasoningTagName(scope.model.id.toLowerCase()) })
  ]
}
