import { WindowType } from '@main/core/window/types'
import { MockMainPreferenceServiceUtils } from '@test-mocks/main/PreferenceService'
import { mockMainLoggerService } from '@test-mocks/MainLoggerService'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  broadcast: vi.fn(),
  broadcastToType: vi.fn(),
  getTopic: vi.fn(),
  updateTopic: vi.fn(),
  getMessageById: vi.fn(),
  getModelByKey: vi.fn(),
  getProviderByProviderId: vi.fn()
}))

vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory({
    AiService: { generateText: mocks.generateText },
    IpcApiService: { broadcast: mocks.broadcast, broadcastToType: mocks.broadcastToType }
  } as never)
})

vi.mock('@data/services/TopicService', () => ({
  topicService: {
    getById: mocks.getTopic,
    update: mocks.updateTopic
  }
}))

vi.mock('@main/data/services/MessageService', () => ({
  messageService: {
    getById: mocks.getMessageById
  }
}))

vi.mock('@data/services/ModelService', () => ({
  modelService: {
    getByKey: mocks.getModelByKey
  }
}))

vi.mock('@data/services/ProviderService', () => ({
  providerService: {
    getByProviderId: mocks.getProviderByProviderId
  }
}))

const { TopicNamingService } = await import('../TopicNamingService')

const QUICK_MODEL_ID = 'openai::quick-model'

function createService() {
  return new TopicNamingService()
}

function mockRenameInputs() {
  mocks.getTopic.mockReturnValue({
    id: 'topic-1',
    name: '',
    isNameManuallyEdited: false
  })
  mocks.getMessageById.mockReturnValue({
    id: 'message-1',
    role: 'user',
    data: { parts: [{ type: 'text', text: 'Hello there' }] }
  })
  mocks.generateText.mockResolvedValue({ text: 'Generated Title' })
}

describe('TopicNamingService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockMainPreferenceServiceUtils.resetMocks()
    mockMainLoggerService.warn.mockClear()
    mockMainLoggerService.debug.mockClear()
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.enabled', true)
    mocks.getModelByKey.mockReturnValue({ id: 'openai::gpt-4o-mini' })
    mocks.getProviderByProviderId.mockReturnValue({ authMethods: ['api-key'] })
    mockRenameInputs()
  })

  it('uses topic.naming.model_id for normal chat summary naming', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.model_id', 'openai::gpt-4o-mini')

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: 'assistant-1',
        uniqueModelId: 'openai::gpt-4o-mini'
      })
    )
    expect(mocks.updateTopic).toHaveBeenCalledWith('topic-1', {
      name: 'Generated Title',
      isNameManuallyEdited: false
    })
    expect(mocks.broadcast).toHaveBeenCalledWith('ai.topic.auto_renamed', { topicId: 'topic-1' })
  })

  it('sends a naming-failed toast event to the main window when summary generation throws', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.model_id', 'openai::gpt-4o-mini')
    mocks.generateText.mockRejectedValue(new Error('Invalid signature'))

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcastToType).toHaveBeenCalledWith(WindowType.Main, 'ai.topic.naming_failed', {
      message: 'Invalid signature'
    })
  })

  it('falls back to the quick assistant model when topic naming model preference is empty', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.model_id', null)
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', QUICK_MODEL_ID)

    await createService().maybeRenameFromConversationSummary('topic-1', undefined, 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: undefined,
        uniqueModelId: QUICK_MODEL_ID
      })
    )
  })

  it('falls back to the quick assistant model when topic naming model preference is invalid', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.model_id', 'bad-value')
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', QUICK_MODEL_ID)

    await createService().maybeRenameFromConversationSummary('topic-1', undefined, 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: QUICK_MODEL_ID
      })
    )
    expect(mockMainLoggerService.warn).toHaveBeenCalledWith(
      'topic.naming.model_id is not usable (invalid, missing, or agent-only provider); falling back to quick assistant model',
      { configured: 'bad-value' }
    )
  })

  it('skips the rename when neither the naming nor the quick assistant model is usable', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.model_id', 'ghost::missing')
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', null)
    mocks.getModelByKey.mockImplementation(() => {
      throw new Error('missing model')
    })

    await createService().maybeRenameFromConversationSummary('topic-1', undefined, 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.getModelByKey).toHaveBeenCalledWith('ghost', 'missing')
    expect(mocks.generateText).not.toHaveBeenCalled()
    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mockMainLoggerService.debug).toHaveBeenCalledWith(
      'No usable topic-naming model configured; skipping auto-rename',
      { topicId: 'topic-1', assistantId: undefined }
    )
  })

  it('does not first-message rename a topic after a manual rename race', async () => {
    mocks.getTopic
      .mockReturnValueOnce({
        id: 'topic-1',
        name: '',
        isNameManuallyEdited: false
      })
      .mockReturnValueOnce({
        id: 'topic-1',
        name: 'Manual Topic',
        isNameManuallyEdited: true
      })
    mocks.getMessageById.mockReturnValue({
      id: 'message-1',
      role: 'user',
      data: { parts: [{ type: 'text', text: 'First user text' }] }
    })

    createService().maybeRenameFromFirstUserMessage('topic-1', 'message-1')

    expect(mocks.getTopic).toHaveBeenCalledTimes(2)
    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it('does not summary-rename a topic after a manual rename race', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.model_id', 'openai::gpt-4o-mini')
    mocks.getTopic
      .mockReturnValueOnce({
        id: 'topic-1',
        name: 'Hello there',
        isNameManuallyEdited: false
      })
      .mockReturnValueOnce({
        id: 'topic-1',
        name: 'Manual Topic',
        isNameManuallyEdited: true
      })

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.getTopic).toHaveBeenCalledTimes(2)
    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it('does not first-message rename a topic that already has a real title', async () => {
    mocks.getTopic.mockReturnValue({
      id: 'topic-1',
      name: 'Existing Title',
      isNameManuallyEdited: false
    })

    createService().maybeRenameFromFirstUserMessage('topic-1', 'message-1')

    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it('allows summary rename while the topic still has the first-message temporary title', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.model_id', 'openai::gpt-4o-mini')
    mocks.getTopic.mockReturnValue({
      id: 'topic-1',
      name: 'Hello there',
      isNameManuallyEdited: false
    })

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.updateTopic).toHaveBeenCalledWith('topic-1', {
      name: 'Generated Title',
      isNameManuallyEdited: false
    })
  })

  it('does not summary-rename a topic that already has a generated title', async () => {
    mocks.getTopic.mockReturnValue({
      id: 'topic-1',
      name: 'Generated Title',
      isNameManuallyEdited: false
    })

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.generateText).not.toHaveBeenCalled()
    expect(mocks.updateTopic).not.toHaveBeenCalled()
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it('falls back when topic naming model points to an external-CLI (agent-only) provider', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.model_id', 'claude-code::haiku')
    MockMainPreferenceServiceUtils.setPreferenceValue('feature.quick_assistant.model_id', QUICK_MODEL_ID)
    mocks.getProviderByProviderId.mockImplementation((providerId: string) =>
      providerId === 'claude-code' ? { authMethods: ['external-cli'] } : { authMethods: ['api-key'] }
    )

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.getModelByKey).not.toHaveBeenCalledWith('claude-code', 'haiku')
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: QUICK_MODEL_ID
      })
    )
    expect(mockMainLoggerService.warn).toHaveBeenCalledWith(
      'topic.naming.model_id is not usable (invalid, missing, or agent-only provider); falling back to quick assistant model',
      { configured: 'claude-code::haiku' }
    )
  })

  it('uses an oauth login-based provider (e.g. Codex/Grok) as a topic naming model', async () => {
    MockMainPreferenceServiceUtils.setPreferenceValue('topic.naming.model_id', 'openai-codex::gpt-5')
    mocks.getProviderByProviderId.mockReturnValue({ authMethods: ['oauth'] })

    await createService().maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Assistant response' }]
    } as never)

    expect(mocks.getModelByKey).toHaveBeenCalledWith('openai-codex', 'gpt-5')
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: 'openai-codex::gpt-5'
      })
    )
  })

  it('does not persist a lone surrogate when the first-message title cut lands inside an emoji', () => {
    // CJK text carries no spaces, so first-message naming falls back to a hard
    // length cut at 50 chars. Place an emoji straddling that boundary: the 49
    // CJK chars fill indices 0-48, and the emoji's high/low surrogate halves sit
    // at indices 49/50. A naive slice(0, 50) keeps the high half but drops its
    // low partner, leaving a lone surrogate (renders as the replacement glyph).
    const longText = '字'.repeat(49) + '😀' + '文'.repeat(20)
    mocks.getMessageById.mockReturnValue({
      id: 'message-1',
      role: 'user',
      data: { parts: [{ type: 'text', text: longText }] }
    })

    createService().maybeRenameFromFirstUserMessage('topic-1', 'message-1')

    expect(mocks.updateTopic).toHaveBeenCalledTimes(1)
    const renamedTo = mocks.updateTopic.mock.calls[0][1] as { name: string }
    // A lone surrogate is a high surrogate with no following low one (or a low
    // surrogate with no preceding high one) — exactly what a mid-pair cut leaves.
    const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    expect(LONE_SURROGATE.test(renamedTo.name)).toBe(false)
  })

  describe('inFlightWrites registry', () => {
    // Entries self-remove a couple of microtasks after their promise settles
    // (trackNamingWrite chains `.catch().finally()` off the returned promise).
    const flushSettles = () => new Promise((resolve) => setImmediate(resolve))

    beforeEach(async () => {
      // Let deletion chains from earlier tests land before asserting absolute sizes —
      // the registry is module-level, shared across service instances.
      await flushSettles()
    })

    it('maybeRenameFromConversationSummary registers under the topic: prefix', async () => {
      const service = createService()

      const pending = service.maybeRenameFromConversationSummary('topic-1', 'assistant-1', 'message-1', {
        role: 'assistant',
        parts: [{ type: 'text', text: 'Assistant response' }]
      } as never)

      expect(service.inFlightWrites().size).toBe(1)
      const [topicKey] = [...service.inFlightWrites().keys()]
      expect(topicKey).toMatch(/^topic:topic-1#\d+$/)

      await pending
      await flushSettles()
      expect(service.inFlightWrites().size).toBe(0)
    })
  })
})
