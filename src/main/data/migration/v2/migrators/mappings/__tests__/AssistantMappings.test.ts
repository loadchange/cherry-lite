import { DEFAULT_ASSISTANT_SETTINGS } from '@shared/data/types/assistant'
import { describe, expect, it } from 'vitest'

import { transformAssistant } from '../AssistantMappings'

describe('AssistantMappings', () => {
  describe('transformAssistant', () => {
    it('should default name to "Unnamed Assistant" when missing', () => {
      const result = transformAssistant({ id: 'ast-3' })
      expect(result.assistant.name).toBe('Unnamed Assistant')
    })

    it('should default name to "Unnamed Assistant" when empty', () => {
      const result = transformAssistant({ id: 'ast-3', name: '' })
      expect(result.assistant.name).toBe('Unnamed Assistant')
    })

    it('should prefer model over defaultModel for primary modelId', () => {
      const result = transformAssistant({
        id: 'ast-4',
        model: { id: 'gpt-4', provider: 'openai' },
        defaultModel: { id: 'gpt-3.5', provider: 'openai' }
      })
      expect(result.assistant.modelId).toBe('openai::gpt-4')
    })

    it('should fall back to defaultModel when model is missing', () => {
      const result = transformAssistant({
        id: 'ast-4b',
        defaultModel: { id: 'gpt-3.5', provider: 'openai' }
      })
      expect(result.assistant.modelId).toBe('openai::gpt-3.5')
    })

    it('should set modelId to null when model provider is not a string', () => {
      const result = transformAssistant({
        id: 'ast-4d',
        model: { id: 'gpt-4', provider: 42 as never }
      })

      expect(result.assistant.modelId).toBeNull()
    })

    it('should set modelId to null when model has missing provider or id', () => {
      const result = transformAssistant({
        id: 'ast-5',
        model: { id: 'gpt-4' }, // no provider
        defaultModel: { provider: 'openai' } // no id
      })
      expect(result.assistant.modelId).toBeNull()
    })

    it('should filter out mcpServers without id', () => {
      const result = transformAssistant({
        id: 'ast-6',
        mcpServers: [{ id: 'srv-1' }, { id: '' }, { name: 'no-id' }]
      })
      expect(result.mcpServers).toHaveLength(1)
      expect(result.mcpServers[0].mcpServerId).toBe('srv-1')
    })

    it('should handle null and undefined optional fields', () => {
      const result = transformAssistant({
        id: 'ast-9',
        name: 'Test',
        prompt: null,
        emoji: undefined,
        description: null,
        settings: undefined,
        mcpMode: null,
        enableWebSearch: undefined
      })

      expect(result.assistant.prompt).toBe('')
      expect(result.assistant.emoji).toBe('🌟')
      expect(result.assistant.description).toBe('')
      // mcpMode/enableWebSearch were null/undefined upstream, so settings stays at the default.
      expect(result.assistant.settings).toStrictEqual(DEFAULT_ASSISTANT_SETTINGS)
      expect(result.legacyTagName).toBeNull()
    })

    it('should normalize the legacy assistant group name', () => {
      const result = transformAssistant({
        id: 'ast-10',
        tags: [' work ']
      })
      expect(result.legacyTagName).toBe('work')
      expect(result.discardedLegacyTagCount).toBe(0)
    })

    it('should keep the first valid legacy tag and report additional entries', () => {
      const result = transformAssistant({ id: 'ast-10b', tags: ['a', 'b'] })

      expect(result.legacyTagName).toBe('a')
      expect(result.discardedLegacyTagCount).toBe(1)
    })

    it('should skip invalid entries before the first valid legacy tag', () => {
      const result = transformAssistant({ id: 'ast-10c', tags: ['', ' work '] })

      expect(result.legacyTagName).toBe('work')
      expect(result.discardedLegacyTagCount).toBe(1)
    })

    it('should return no legacy group when tags is not an array', () => {
      const result = transformAssistant({ id: 'ast-11', tags: 'not-an-array' as any })
      expect(result.legacyTagName).toBeNull()
    })

    it('should return no legacy group when tags is empty, null, or undefined', () => {
      expect(transformAssistant({ id: 'ast-12', tags: [] }).legacyTagName).toBeNull()
      expect(transformAssistant({ id: 'ast-13', tags: null }).legacyTagName).toBeNull()
      expect(transformAssistant({ id: 'ast-14' }).legacyTagName).toBeNull()
    })

    it('should build settings from top-level fields when settings object is absent', () => {
      const result = transformAssistant({
        id: 'ast-15',
        mcpMode: 'auto',
        enableWebSearch: true
      })
      expect(result.assistant.settings).toStrictEqual({
        ...DEFAULT_ASSISTANT_SETTINGS,
        mcpMode: 'auto',
        enableWebSearch: true
      })
    })

    it('drops invalid legacy field values and falls back to v2 defaults', () => {
      // v1's "disabled = use model default" pattern stored maxTokens=0 alongside
      // enableMaxTokens=false — the 0 violates v2's `.positive()` rule.
      // Migrator must drop it so the v2 row is valid from the start.
      const result = transformAssistant({
        id: 'ast-15',
        // Cast the whole bag once: OldAssistantSettings types fields strictly
        // for documentation, but real legacy data in the wild is unconstrained.
        settings: { maxTokens: 0, enableMaxTokens: false, temperature: 0.5 } as never,
        // Bogus mcpMode left over from confused v1 callers (real v2 enum is
        // 'disabled' | 'auto' | 'manual').
        mcpMode: 'prompt' as never
      })
      expect(result.assistant.settings).toStrictEqual({
        ...DEFAULT_ASSISTANT_SETTINGS,
        // Valid value preserved.
        temperature: 0.5,
        // Booleans validated independently — false survives.
        enableMaxTokens: false
        // maxTokens and mcpMode stay at DEFAULT (sanitiser dropped invalid).
      })
    })
  })
})
