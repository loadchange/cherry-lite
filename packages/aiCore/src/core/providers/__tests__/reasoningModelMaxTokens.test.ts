import { createCherryIn } from '@cherrystudio/ai-sdk-provider'
import { describe, expect, it, vi } from 'vitest'

import { coreExtensions } from '../core/initialization'

vi.mock('@cherrystudio/ai-sdk-provider', () => vi.importActual('../../../../../ai-sdk-provider/src/index.ts'))

describe('compatible providers — reasoning model token limits on the HTTP request', () => {
  it.each([
    ['openai-compatible', 'gpt-5', { max_completion_tokens: 42 }],
    ['cherryin', 'o3-mini', { max_completion_tokens: 42 }],
    ['openai-compatible', 'gpt-5-chat-latest', { max_tokens: 42 }]
  ] as const)('%s sends the supported token field for %s', async (name, modelId, expected) => {
    let body: Record<string, unknown> = {}
    const fetch = vi.fn(async (_url, init) => {
      body = JSON.parse(init.body)
      return new Response(
        JSON.stringify({
          id: 'test-response',
          created: 1,
          model: modelId,
          choices: [{ index: 0, message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    })
    const extension = coreExtensions.find((entry) => entry.config.name === name)!
    const settings = {
      name: 'test',
      apiKey: 'test-key',
      baseURL: 'https://example.invalid/v1',
      fetch
    }
    const model =
      name === 'cherryin'
        ? createCherryIn(settings).chat(modelId)
        : extension.config.create(settings).languageModel(modelId)
    await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      maxOutputTokens: 42
    })
    expect(body).toMatchObject(expected)
    expect(body).not.toHaveProperty('max_tokens' in expected ? 'max_completion_tokens' : 'max_tokens')
  })
})
