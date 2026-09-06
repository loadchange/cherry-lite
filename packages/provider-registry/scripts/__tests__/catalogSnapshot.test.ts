import { describe, expect, it } from 'vitest'

import { mergeSelectedRows, refreshSnapshotReasoning } from '../catalogSnapshot'

describe('selective catalog regeneration', () => {
  it('updates selected models while preserving unrelated prices and retired models', () => {
    const before = [
      { id: 'old-preview', price: 1 },
      { id: 'kimi-k3', price: 2 }
    ]
    const generated = [
      { id: 'unrelated-new-model', price: 3 },
      { id: 'kimi-k3', price: 4 }
    ]
    expect(mergeSelectedRows(before, generated, new Set(['kimi-k3']), (row) => row.id)).toEqual([
      { id: 'old-preview', price: 1 },
      { id: 'kimi-k3', price: 4 }
    ])
  })

  it('adds and removes selected IDs without importing unrelated generated rows', () => {
    expect(
      mergeSelectedRows(
        [{ id: 'moving-alias' }],
        [{ id: 'vision' }, { id: 'other' }],
        new Set(['moving-alias', 'vision']),
        (row) => row.id
      )
    ).toEqual([{ id: 'vision' }])
  })

  it('refreshes existing reasoning descriptors without changing their prices or served IDs', () => {
    const before = [{ providerId: 'openrouter', modelId: 'model', apiModelId: 'vendor/model', price: 1 }]
    const reasoningContracts = { 'openai-chat-completions': { support: { controls: [{ kind: 'toggle' }] } } }
    const generated = [
      { ...before[0], price: 10, reasoningContracts },
      { providerId: 'openrouter', modelId: 'new-model', apiModelId: 'vendor/new-model', price: 20, reasoningContracts }
    ]
    expect(refreshSnapshotReasoning(before, generated, new Set(['openrouter']))).toEqual([
      { ...before[0], reasoningContracts }
    ])
  })

  it('does not copy a different serving variant into a removed snapshot variant', () => {
    const before = [{ providerId: 'openrouter', modelId: 'model', apiModelId: 'vendor/model:free' }]
    const generated = [
      { providerId: 'openrouter', modelId: 'model', apiModelId: 'vendor/model', reasoningContracts: { paid: true } }
    ]
    expect(refreshSnapshotReasoning(before, generated, new Set(['openrouter']))).toEqual(before)
  })
})
