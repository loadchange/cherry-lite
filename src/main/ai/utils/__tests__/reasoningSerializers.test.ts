import {
  inferReasoningControls,
  REASONING_FORMAT_PROFILES,
  type ReasoningEffort,
  type ReasoningWireProfile
} from '@cherrystudio/provider-registry'
import { describe, expect, it } from 'vitest'

import { makeModel } from '../../__tests__/fixtures'
import { encodeReasoningInvocation, resolveReasoningInvocation } from '../reasoningSerializers'

describe('automatic effort against a model that does not declare it', () => {
  const autoWire = (
    autoEffort: ReasoningEffort,
    translations: Partial<Record<ReasoningEffort, ReasoningEffort>> = {}
  ) =>
    ({
      auto: {
        operations: [{ target: 'reasoningEffort', value: { source: 'effort' } }],
        effortMap: { auto: autoEffort, ...translations }
      }
    }) satisfies ReasoningWireProfile

  const withEfforts = (...selectableEfforts: ReasoningEffort[]) =>
    makeModel({ reasoning: { controls: [{ kind: 'effort', values: selectableEfforts }], selectableEfforts } })

  it('sends the nearest declared tier instead of the provider default Kimi K3 rejects', () => {
    const invocation = resolveReasoningInvocation({
      selection: 'auto',
      model: withEfforts('low', 'high', 'max'),
      profile: autoWire('medium')
    })

    expect(encodeReasoningInvocation(invocation)).toEqual({ reasoningEffort: 'high' })
  })

  // A profile with no auto mode resolves to its effort one, which carries no tier for `auto`.
  // DashScope's Kimi K3 is shaped this way and would otherwise receive the literal string `auto`.
  describe('a profile whose effort mode has to stand in for auto', () => {
    const effortOnly = {
      effort: { operations: [{ target: 'reasoning_effort', value: { source: 'effort' } }] }
    } satisfies ReasoningWireProfile

    it("falls back to the model's own default tier", () => {
      const model = makeModel({
        reasoning: {
          controls: [{ kind: 'effort', values: ['none', 'max'] }],
          selectableEfforts: ['none', 'max'],
          defaultEffort: 'max'
        }
      })
      const invocation = resolveReasoningInvocation({ selection: 'auto', model, profile: effortOnly })

      expect(encodeReasoningInvocation(invocation)).toEqual({ reasoning_effort: 'max' })
    })

    it('omits the mode when the model declares no default, letting the provider decide', () => {
      const invocation = resolveReasoningInvocation({
        selection: 'auto',
        model: withEfforts('low', 'high'),
        profile: effortOnly
      })

      expect(invocation).toMatchObject({ kind: 'omit', emissions: [] })
    })
  })

  // The projection lands on a canonical tier; the map's vendor translation must still apply to it.
  it('translates the projected tier through the same effortMap', () => {
    const invocation = resolveReasoningInvocation({
      selection: 'auto',
      model: withEfforts('xhigh'),
      profile: autoWire('medium', { xhigh: 'max' })
    })

    expect(encodeReasoningInvocation(invocation)).toEqual({ reasoningEffort: 'max' })
  })

  // A toggle-only model offers no tier to project onto, so the profile's value is all there is.
  it('keeps the profile tier when the model declares no efforts', () => {
    const toggleOnly = makeModel({
      reasoning: { controls: [{ kind: 'toggle' }], selectableEfforts: ['none', 'auto'] }
    })
    const invocation = resolveReasoningInvocation({ selection: 'auto', model: toggleOnly, profile: autoWire('medium') })

    expect(encodeReasoningInvocation(invocation)).toEqual({ reasoningEffort: 'medium' })
  })

  // An explicit selection was already clamped to the model; its map entry is a vendor rename.
  it('leaves an explicitly selected effort untouched by the projection', () => {
    const invocation = resolveReasoningInvocation({
      selection: 'xhigh',
      model: withEfforts('low', 'xhigh'),
      profile: {
        effort: {
          operations: [{ target: 'reasoningEffort', value: { source: 'effort' } }],
          effortMap: { xhigh: 'max' }
        }
      }
    })

    expect(encodeReasoningInvocation(invocation)).toEqual({ reasoningEffort: 'max' })
  })
})

const budgetProfile: ReasoningWireProfile = {
  effort: {
    operations: [{ target: 'thinking.budgetTokens', value: { source: 'budget' } }],
    budget: { min: 1024, missing: { type: 'fallback', value: 13_312 }, clampToMaxTokens: true }
  }
}

const model = makeModel({
  reasoning: {
    controls: [{ kind: 'budget', min: 1024, max: 64_000 }],
    selectableEfforts: ['high'],
    thinkingTokenLimits: { min: 1024, max: 64_000 }
  }
})

describe('resolveReasoningInvocation budget constraints', () => {
  it.each([256, 1024])('omits a budget mode when maxTokens=%i cannot satisfy its minimum', (maxTokens) => {
    expect(resolveReasoningInvocation({ selection: 'high', model, profile: budgetProfile, maxTokens })).toEqual({
      kind: 'omit',
      selection: 'high',
      emissions: []
    })
  })

  it('clamps budget below maxTokens while preserving the declared minimum', () => {
    const result = resolveReasoningInvocation({ selection: 'high', model, profile: budgetProfile, maxTokens: 8192 })

    expect(result.kind).toBe('budget')
    expect(result.budgetTokens).toBe(8191)
    expect(result.budgetTokens).toBeGreaterThanOrEqual(1024)
    expect(result.budgetTokens).toBeLessThan(8192)
  })

  it('encodes an audited provider budget target without serializer model branches', () => {
    const profile: ReasoningWireProfile = {
      effort: {
        operations: [{ target: 'reasoning_budget', value: { source: 'budget' } }],
        budget: { min: 1, missing: { type: 'omit-mode' } }
      }
    }
    const invocation = resolveReasoningInvocation({ selection: 'high', model, profile })

    expect(encodeReasoningInvocation(invocation)).toEqual({ reasoning_budget: 51_404 })
  })

  it('encodes an audited nested string toggle target', () => {
    const profile: ReasoningWireProfile = {
      auto: {
        operations: [{ target: 'chat_template_kwargs.thinking_mode', value: { source: 'literal', value: 'adaptive' } }]
      }
    }
    const toggleModel = makeModel({
      reasoning: { controls: [{ kind: 'toggle' }], selectableEfforts: ['none', 'auto'] }
    })
    const invocation = resolveReasoningInvocation({ selection: 'auto', model: toggleModel, profile })

    expect(encodeReasoningInvocation(invocation)).toEqual({ chat_template_kwargs: { thinking_mode: 'adaptive' } })
  })

  it('encodes Gemma 4 thinking control as Ollama booleans', () => {
    const controls = inferReasoningControls('gemma4:31b')
    expect(controls).toEqual([{ kind: 'toggle' }])

    const gemma4 = makeModel({
      reasoning: { controls, selectableEfforts: ['none', 'auto'] }
    })
    const profile = REASONING_FORMAT_PROFILES.ollama.wire

    const enabled = resolveReasoningInvocation({ selection: 'auto', model: gemma4, profile })
    const disabled = resolveReasoningInvocation({ selection: 'none', model: gemma4, profile })

    expect(encodeReasoningInvocation(enabled)).toEqual({ think: true })
    expect(encodeReasoningInvocation(disabled)).toEqual({ think: false })
  })
})
