import { BaseService } from '@main/core/lifecycle/BaseService'
import { MODEL_CAPABILITY } from '@shared/data/types/model'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateAgent = vi.fn()
const mockEmbedMany = vi.fn()
const mockRerank = vi.fn()
const mockApplicationGet = vi.fn()
const mockAssistantGetById = vi.fn()
const mockMessageGetById = vi.fn()
const mockMessageUpdate = vi.fn()
const mockMessageApplyApproval = vi.fn()
const mockProviderGetByProviderId = vi.fn()
const mockProviderGetRotatedApiKey = vi.fn()
const mockModelGetByKey = vi.fn()
const mockListProviderRegistryModels = vi.fn()
const mockListModelsFromProvider = vi.fn()
const mockRegisterBuiltinTools = vi.fn()
const mockInstallProviderUserAgentInterceptor = vi.fn(() => vi.fn())
const mockRecordRequest = vi.fn()

vi.mock('@application', () => ({
  application: {
    get: mockApplicationGet,
    getPath: vi.fn((key: string, filename?: string) => (filename ? `/mock/${key}/${filename}` : `/mock/${key}`))
  }
}))

vi.mock('@data/services/AssistantService', () => ({
  assistantDataService: {
    getById: (...args: unknown[]) => mockAssistantGetById(...args)
  }
}))

vi.mock('../tools/adapters/aiSdk/builtin/registerBuiltinTools', () => ({
  registerBuiltinTools: (...args: unknown[]) => mockRegisterBuiltinTools(...args)
}))

vi.mock('../utils/customFetch', () => ({
  installProviderUserAgentInterceptor: () => mockInstallProviderUserAgentInterceptor()
}))

vi.mock('@main/data/services/ProviderService', () => ({
  providerService: {
    getByProviderId: (...args: unknown[]) => mockProviderGetByProviderId(...args),
    getRotatedApiKey: (...args: unknown[]) => mockProviderGetRotatedApiKey(...args)
  }
}))

vi.mock('@main/data/services/ModelService', () => ({
  modelService: {
    getByKey: (...args: unknown[]) => mockModelGetByKey(...args)
  }
}))

vi.mock('@data/services/ProviderRegistryService', () => ({
  providerRegistryService: {
    listProviderRegistryModels: (...args: unknown[]) => mockListProviderRegistryModels(...args)
  }
}))

vi.mock('../provider/listModels', () => ({
  listModels: (...args: unknown[]) => mockListModelsFromProvider(...args)
}))
vi.mock('@main/data/services/MessageService', () => ({
  messageService: {
    getById: mockMessageGetById,
    update: mockMessageUpdate,
    applyToolApprovalDecisions: mockMessageApplyApproval
  }
}))

vi.mock('@cherrystudio/ai-core', () => ({
  createAgent: (...args: unknown[]) => mockCreateAgent(...args),
  embedMany: async (...args: unknown[]) => {
    const result = await mockEmbedMany(...args)
    const params = args[2] as { onProviderCall?: (event: unknown) => void }
    params.onProviderCall?.({
      modality: 'embedding',
      requestId: 'ai-core:embedding:test',
      providerId: args[0],
      modelId: 'test-embedding-model',
      usage: result.usage,
      metrics: { timeCompletionMs: 10 },
      completedAt: 100
    })
    return result
  },
  rerank: async (...args: unknown[]) => {
    const result = await mockRerank(...args)
    const params = args[2] as { onProviderCall?: (event: unknown) => void }
    params.onProviderCall?.({
      modality: 'rerank',
      requestId: 'ai-core:rerank:test',
      providerId: args[0],
      modelId: 'test-reranker',
      metrics: { timeCompletionMs: 10 },
      completedAt: 100
    })
    return result
  }
}))

vi.mock('@main/data/services/AiUsageRecordService', async (importActual) => {
  const actual = (await importActual()) as object
  return {
    ...actual,
    aiUsageRecordService: {
      recordInvocation: (...args: unknown[]) => mockRecordRequest(...args)
    }
  }
})

const { AiService } = await import('../AiService')
const { messageService } = await import('@main/data/services/MessageService')

/**
 * Instantiate `AiService` directly (without going through the lifecycle
 * container) so unit tests can drive its methods in isolation.
 */
function createService(): InstanceType<typeof AiService> {
  BaseService.resetInstances()
  return new (AiService as any)()
}

describe('AiService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateAgent.mockReset()
    mockAssistantGetById.mockReturnValue(undefined)
    mockProviderGetRotatedApiKey.mockReturnValue('test-key')
    mockProviderGetByProviderId.mockReturnValue({
      id: 'test-provider',
      name: 'Test Provider',
      apiKeys: [],
      authType: 'api-key',
      apiFeatures: {
        arrayContent: true,
        streamOptions: true,
        developerRole: false,
        serviceTier: false,
        verbosity: false
      },
      settings: {},
      isEnabled: true
    })
    mockModelGetByKey.mockReturnValue({
      id: 'test-provider::test-model',
      providerId: 'test-provider',
      apiModelId: 'test-model',
      name: 'Test Model',
      capabilities: [],
      supportsStreaming: true,
      isEnabled: true,
      isHidden: false
    })
    // Default: resolve, like the real usage-record store's best-effort contract. Individual
    // tests override with mockRejectedValueOnce to exercise the failure path.
    mockRecordRequest.mockResolvedValue(undefined)
  })

  describe('embedMany — AI usage record', () => {
    function stubEmbedding(service: InstanceType<typeof AiService>) {
      vi.spyOn(service as never, 'buildAgentParamsFor').mockResolvedValue({
        sdkConfig: { providerId: 'test-provider', providerSettings: {}, modelId: 'test-embedding-model' },
        credentialReceipt: {
          attribution: 'explicit',
          id: 'key-a',
          label: 'Primary',
          masked: 'sk-a****aaaa'
        },
        provider: {
          id: 'test-provider',
          name: 'Test Provider',
          apiFeatures: { reportsActualCost: false }
        },
        model: {
          id: 'test-provider::test-embedding-model',
          providerId: 'test-provider',
          name: 'Test Embedding Model'
        },
        assistant: { id: 'assistant-1', name: 'Embedding Assistant', emoji: '📚' }
      } as never)
      mockEmbedMany.mockResolvedValue({ embeddings: [[0.1, 0.2]], usage: { tokens: 42 } })
    }

    it('records the usage entry with modality "embedding" and the token count', async () => {
      const service = createService()
      stubEmbedding(service)

      await service.embedMany({ uniqueModelId: 'test-provider::test-embedding-model', values: ['hello'] })

      expect(mockRecordRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'ai-core:embedding:test',
          context: expect.objectContaining({
            credentialReceipt: {
              attribution: 'explicit',
              id: 'key-a',
              label: 'Primary',
              masked: 'sk-a****aaaa'
            },
            source: { type: 'assistant', id: 'assistant-1', name: 'Embedding Assistant', icon: '📚' }
          }),
          modality: 'embedding',
          usage: { inputTokens: 42, totalTokens: 42 }
        })
      )
    })

    it('records an embedding request when the provider explicitly reports zero tokens', async () => {
      const service = createService()
      stubEmbedding(service)
      mockEmbedMany.mockResolvedValue({ embeddings: [[0.1, 0.2]], usage: { tokens: 0 } })

      await service.embedMany({ uniqueModelId: 'test-provider::test-embedding-model', values: ['hello'] })

      expect(mockRecordRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          modality: 'embedding',
          usage: { inputTokens: 0, totalTokens: 0 }
        })
      )
    })
  })
})

describe('AiService.onInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApplicationGet.mockImplementation((name: string) =>
      name === 'JobManager' ? { registerHandler: vi.fn() } : undefined
    )
  })

  it('registers the builtin AI SDK tools', async () => {
    const service = createService()

    await expect(service._doInit()).resolves.toBeUndefined()

    expect(mockRegisterBuiltinTools).toHaveBeenCalledOnce()
  })
})

describe('AiService tool approval', () => {
  /** A fake renderer event whose `sender` satisfies `WebContentsListener`'s constructor. */
  function fakeEvent() {
    return {
      sender: {
        id: 1,
        once: vi.fn(),
        isDestroyed: () => false,
        send: vi.fn()
      }
    } as never
  }

  /** A minimal `approval-requested` tool UI part (passes `isToolUIPart`). */
  function pendingToolPart(approvalId: string, toolName = 'mcp_write') {
    return {
      type: `tool-${toolName}`,
      toolCallId: `tc-${approvalId}`,
      state: 'approval-requested',
      input: {},
      approval: { id: approvalId }
    }
  }

  function approvalMutationResult(
    parts: unknown[],
    appliedApprovalIds: string[] = [],
    alreadySettledApprovalIds: string[] = []
  ) {
    return { parts, appliedApprovalIds, alreadySettledApprovalIds }
  }

  /**
   * The `ai.tool.respond_approval` flow lives in `AiService.respondToolApproval(payload, senderWc)`
   * (the IpcApi handler in `handlers/ai.ts` resolves the WebContents from `ctx.senderId` and calls
   * it). Adapt to the old `(event, payload)` call shape so the cases below read unchanged.
   */
  function getApprovalHandler() {
    const service = createService()
    return (
      event: { sender: Electron.WebContents },
      payload: {
        approvalId: string
        approved: boolean
        reason?: string
        updatedInput?: Record<string, unknown>
        topicId?: string
        anchorId?: string
      }
    ) => service.respondToolApproval(payload, event.sender)
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { ok: false } when there is no live entry and no anchor context', async () => {
    mockApplicationGet.mockImplementation(() => undefined)
    const getById = vi.spyOn(messageService, 'getById')

    const handler = getApprovalHandler()
    const result = await handler(fakeEvent(), {
      approvalId: 'orphan-approval-1',
      approved: true
      // no topicId / anchorId
    })

    expect(result).toEqual({ ok: false })
    expect(getById).not.toHaveBeenCalled()
  })

  it('applies the decision atomically and dispatches continue-conversation when nothing is left pending', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined)
    mockApplicationGet.mockImplementation((name: string) => {
      if (name === 'AiStreamManager') return { dispatch, hasLiveStream: () => false }
      return undefined
    })

    // The serialized atomic mutation returns the committed parts with the decision applied; the
    // handler computes "still pending" from THESE committed parts, not a local stale copy.
    const committed = [
      { type: 'text', text: 'hello' },
      { ...pendingToolPart('mcp-approval-1'), state: 'approval-responded', input: { command: 'pwd' } }
    ]
    const apply = vi
      .spyOn(messageService, 'applyToolApprovalDecisions')
      .mockReturnValue(approvalMutationResult(committed, ['mcp-approval-1']) as never)

    const handler = getApprovalHandler()
    const result = await handler(fakeEvent(), {
      approvalId: 'mcp-approval-1',
      approved: true,
      updatedInput: { command: 'pwd' },
      topicId: 'topic-1',
      anchorId: 'anchor-1'
    })

    expect(result).toEqual({ ok: true })
    // The decision goes through the serialized read-modify-write, not an ad-hoc getById+update.
    expect(apply).toHaveBeenCalledWith('anchor-1', [
      { approvalId: 'mcp-approval-1', approved: true, updatedInput: { command: 'pwd' } }
    ])
    // Nothing left pending → resume via continue-conversation.
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        trigger: 'continue-conversation',
        topicId: 'topic-1',
        parentAnchorId: 'anchor-1',
        approvalDecisions: [{ approvalId: 'mcp-approval-1', approved: true, updatedInput: { command: 'pwd' } }]
      })
    )
  })

  it('skips the continuation (ok:false) when there is no caller window to stream it to', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined)
    mockApplicationGet.mockImplementation((name: string) => {
      if (name === 'AiStreamManager') return { dispatch, hasLiveStream: () => false }
      return undefined
    })
    const committed = [{ ...pendingToolPart('mcp-approval-1'), state: 'approval-responded' }]
    vi.spyOn(messageService, 'applyToolApprovalDecisions').mockReturnValue(
      approvalMutationResult(committed, ['mcp-approval-1']) as never
    )

    // No managed window → senderWc undefined: the continuation has nothing to surface on.
    const handler = getApprovalHandler()
    const result = await handler({ sender: undefined } as never, {
      approvalId: 'mcp-approval-1',
      approved: true,
      topicId: 'topic-1',
      anchorId: 'anchor-1'
    })

    expect(result).toEqual({ ok: false })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('refuses (ok:false) without mutating the row when a stream is still live on the topic', async () => {
    // The approval card is clickable the moment the chunk arrives (live overlay), so a response can
    // land while a sibling exec / another continuation is still live. Dispatching continue-conversation
    // then would hit send()'s inject path and silently swallow the approved turn. Gate it: refuse
    // before touching the row, so the card stays actionable and the renderer can retry post-settle.
    const dispatch = vi.fn().mockResolvedValue(undefined)
    const hasLiveStream = vi.fn(() => true)
    mockApplicationGet.mockImplementation((name: string) => {
      if (name === 'AiStreamManager') return { dispatch, hasLiveStream }
      return undefined
    })
    const apply = vi.spyOn(messageService, 'applyToolApprovalDecisions')

    const handler = getApprovalHandler()
    const result = await handler(fakeEvent(), {
      approvalId: 'mcp-approval-1',
      approved: true,
      topicId: 'topic-1',
      anchorId: 'anchor-1'
    })

    expect(result).toEqual({ ok: false })
    expect(hasLiveStream).toHaveBeenCalledWith('topic-1')
    // Row is NOT mutated and no continuation is dispatched.
    expect(apply).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('still dispatches when the committed parts report nothing pending (overlay-only decision)', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined)
    mockApplicationGet.mockImplementation((name: string) => {
      if (name === 'AiStreamManager') return { dispatch, hasLiveStream: () => false }
      return undefined
    })

    // Overlay-only: the target part isn't on the row, so the committed parts carry no pending approval.
    const apply = vi
      .spyOn(messageService, 'applyToolApprovalDecisions')
      .mockReturnValue(approvalMutationResult([{ type: 'text', text: 'hello' }]) as never)

    const handler = getApprovalHandler()
    const result = await handler(fakeEvent(), {
      approvalId: 'mcp-approval-missing',
      approved: false,
      topicId: 'topic-1',
      anchorId: 'anchor-1'
    })

    expect(result).toEqual({ ok: true })
    expect(apply).toHaveBeenCalledWith('anchor-1', [{ approvalId: 'mcp-approval-missing', approved: false }])
    // The decision still rides the continue dispatch idempotently.
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        trigger: 'continue-conversation',
        approvalDecisions: [{ approvalId: 'mcp-approval-missing', approved: false }]
      })
    )
  })

  it('does not finalize while another approval on the turn is still pending', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined)
    mockApplicationGet.mockImplementation((name: string) => {
      if (name === 'AiStreamManager') return { dispatch, hasLiveStream: () => false }
      return undefined
    })

    // Committed parts: this approval decided, but a sibling is still approval-requested.
    vi.spyOn(messageService, 'applyToolApprovalDecisions').mockReturnValue(
      approvalMutationResult(
        [
          { ...pendingToolPart('mcp-approval-1'), state: 'approval-responded' },
          pendingToolPart('mcp-approval-2', 'mcp_read')
        ],
        ['mcp-approval-1']
      ) as never
    )

    const handler = getApprovalHandler()
    const result = await handler(fakeEvent(), {
      approvalId: 'mcp-approval-1',
      approved: true,
      topicId: 'topic-1',
      anchorId: 'anchor-1'
    })

    expect(result).toEqual({ ok: true })
    // The still-pending sibling gates the resume.
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ignores duplicate already-settled approval responses without dispatching another continuation', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined)
    mockApplicationGet.mockImplementation((name: string) => {
      if (name === 'AiStreamManager') return { dispatch, hasLiveStream: () => false }
      return undefined
    })

    const apply = vi
      .spyOn(messageService, 'applyToolApprovalDecisions')
      .mockReturnValue(
        approvalMutationResult(
          [{ ...pendingToolPart('mcp-approval-1'), state: 'approval-responded' }],
          [],
          ['mcp-approval-1']
        ) as never
      )

    const handler = getApprovalHandler()
    const result = await handler(fakeEvent(), {
      approvalId: 'mcp-approval-1',
      approved: true,
      topicId: 'topic-1',
      anchorId: 'anchor-1'
    })

    expect(result).toEqual({ ok: true })
    expect(apply).toHaveBeenCalledWith('anchor-1', [{ approvalId: 'mcp-approval-1', approved: true }])
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('returns { ok: false } when the anchor message is missing or deleted', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined)
    mockApplicationGet.mockImplementation((name: string) => {
      if (name === 'AiStreamManager') return { dispatch, hasLiveStream: () => false }
      return undefined
    })

    // A stale click on a deleted message: the atomic mutation reports the anchor is gone (null).
    const apply = vi.spyOn(messageService, 'applyToolApprovalDecisions').mockReturnValue(null)

    const handler = getApprovalHandler()
    const result = await handler(fakeEvent(), {
      approvalId: 'mcp-approval-1',
      approved: true,
      topicId: 'topic-1',
      anchorId: 'deleted-anchor'
    })

    // Resolves gracefully through the documented result shape instead of throwing.
    expect(result).toEqual({ ok: false })
    expect(apply).toHaveBeenCalledWith('deleted-anchor', [{ approvalId: 'mcp-approval-1', approved: true }])
    expect(dispatch).not.toHaveBeenCalled()
  })

  // Payload validation (empty `approvalId`, missing `approved`) now lives in the IpcApi router's
  // zod parse of `ai.tool.respond_approval`, not in `respondToolApproval` — so the invalid-payload
  // case is no longer unit-tested here (a thin schema contract; see ipc-usage.md "Testing").

  it('routes rerank requests through ai-core rerank', async () => {
    const service = createService()
    const abortController = new AbortController()
    vi.spyOn(service as never, 'buildAgentParamsFor').mockResolvedValue({
      sdkConfig: {
        providerId: 'test-provider',
        providerSettings: {},
        modelId: 'test-reranker'
      },
      options: {
        headers: { 'x-test': 'yes' },
        maxRetries: 0
      },
      credentialReceipt: { attribution: 'explicit', id: 'key-a', masked: 'sk-a****aaaa' },
      provider: {
        id: 'test-provider',
        name: 'Test Provider',
        apiFeatures: { reportsActualCost: false }
      },
      model: {
        id: 'test-provider::test-reranker',
        providerId: 'test-provider',
        name: 'Test Reranker'
      }
    } as never)

    mockRerank.mockResolvedValue({
      ranking: [
        { originalIndex: 1, score: 0.9, document: 'beta' },
        { originalIndex: 0, score: 0.2, document: 'alpha' }
      ]
    })

    await expect(
      service.rerank({
        uniqueModelId: 'test-provider::test-reranker',
        query: 'hello',
        documents: ['alpha', 'beta'],
        topN: 2,
        requestOptions: {
          headers: { 'x-test': 'yes' },
          maxRetries: 0,
          signal: abortController.signal
        }
      })
    ).resolves.toEqual({
      ranking: [
        { originalIndex: 1, score: 0.9 },
        { originalIndex: 0, score: 0.2 }
      ]
    })

    expect(mockRerank).toHaveBeenCalledWith(
      'test-provider',
      {},
      expect.objectContaining({
        model: 'test-reranker',
        query: 'hello',
        documents: ['alpha', 'beta'],
        topN: 2,
        headers: { 'x-test': 'yes' },
        maxRetries: 0,
        abortSignal: abortController.signal
      })
    )
    expect(mockRecordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'ai-core:rerank:test',
        modality: 'rerank',
        metrics: { timeCompletionMs: 10 }
      })
    )
  })

  it('checks rerank models with rerank before embedding or text generation', async () => {
    const service = createService()
    const rerankSpy = vi.spyOn(service, 'rerank').mockResolvedValue({ ranking: [{ originalIndex: 0, score: 1 }] })
    const embedSpy = vi.spyOn(service, 'embedMany')
    const generateSpy = vi.spyOn(service, 'generateText')

    mockModelGetByKey.mockReturnValue({
      id: 'test-provider::test-reranker',
      providerId: 'test-provider',
      apiModelId: 'test-reranker',
      name: 'Test Reranker',
      capabilities: [MODEL_CAPABILITY.RERANK, MODEL_CAPABILITY.EMBEDDING],
      supportsStreaming: false,
      isEnabled: true,
      isHidden: false
    })

    await service.checkModel({
      uniqueModelId: 'test-provider::test-reranker'
    })

    expect(rerankSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'test',
        documents: ['test'],
        topN: 1
      })
    )
    expect(embedSpy).not.toHaveBeenCalled()
    expect(generateSpy).not.toHaveBeenCalled()
  })

  it('passes the selected API key override into text health checks', async () => {
    const service = createService()
    const generateSpy = vi.spyOn(service, 'generateText').mockResolvedValue({ text: 'ok' })
    mockModelGetByKey.mockReturnValue({
      id: 'test-provider::test-model',
      providerId: 'test-provider',
      apiModelId: 'test-model',
      name: 'Test Model',
      capabilities: [],
      supportsStreaming: true,
      isEnabled: true,
      isHidden: false
    })

    await service.checkModel({
      uniqueModelId: 'test-provider::test-model',
      apiKeyOverride: 'sk-selected'
    })

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyOverride: 'sk-selected',
        system: 'test',
        prompt: 'hi'
      })
    )
  })

  it('checks embedding models with the normal embedding path', async () => {
    const service = createService()
    const embedSpy = vi.spyOn(service, 'embedMany').mockResolvedValue({ embeddings: [[1]] })
    mockModelGetByKey.mockReturnValue({
      id: 'test-provider::test-embedding',
      providerId: 'test-provider',
      apiModelId: 'test-embedding',
      name: 'Test Embedding',
      capabilities: [MODEL_CAPABILITY.EMBEDDING],
      supportsStreaming: false,
      isEnabled: true,
      isHidden: false
    })

    await service.checkModel({
      uniqueModelId: 'test-provider::test-embedding'
    })

    expect(embedSpy).toHaveBeenCalledWith(expect.objectContaining({ values: ['test'] }))
  })

  it('fails rerank health checks when the probe returns an empty ranking', async () => {
    const service = createService()
    vi.spyOn(service, 'rerank').mockResolvedValue({ ranking: [] })

    mockModelGetByKey.mockReturnValue({
      id: 'test-provider::test-reranker',
      providerId: 'test-provider',
      apiModelId: 'test-reranker',
      name: 'Test Reranker',
      capabilities: [MODEL_CAPABILITY.RERANK],
      supportsStreaming: false,
      isEnabled: true,
      isHidden: false
    })

    await expect(
      service.checkModel({
        uniqueModelId: 'test-provider::test-reranker'
      })
    ).rejects.toThrow('Rerank health check returned empty ranking')
  })
})

describe('AiService.listModels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the shipped registry catalog for a registry-sourced provider without calling the API', async () => {
    const service = createService()
    const registryModels = [{ id: 'claude-code::haiku' }, { id: 'claude-code::sonnet' }]
    mockProviderGetByProviderId.mockReturnValue({ id: 'claude-code', modelListSource: 'registry' })
    mockListProviderRegistryModels.mockReturnValue(registryModels)

    const result = await service.listModels({ providerId: 'claude-code' })

    expect(result).toBe(registryModels)
    expect(mockListProviderRegistryModels).toHaveBeenCalledWith({
      providerId: 'claude-code',
      presetProviderId: null
    })
    expect(mockListModelsFromProvider).not.toHaveBeenCalled()
  })

  it('pulls the model list over the API for an api-sourced provider, returning it as-is when the registry adds nothing', async () => {
    const service = createService()
    const provider = { id: 'openai', modelListSource: 'api' }
    const apiModels = [{ id: 'openai::gpt-4o-mini', apiModelId: 'gpt-4o-mini' }]
    mockProviderGetByProviderId.mockReturnValue(provider)
    mockListModelsFromProvider.mockResolvedValue(apiModels)
    mockListProviderRegistryModels.mockReturnValue([])

    const result = await service.listModels({ providerId: 'openai' })

    expect(result).toBe(apiModels)
    expect(mockListModelsFromProvider).toHaveBeenCalledWith(provider, undefined, { throwOnError: undefined })
    expect(mockListProviderRegistryModels).toHaveBeenCalledWith({
      providerId: 'openai',
      presetProviderId: null
    })
  })

  it('appends registry-only models the API never returns, deduping enrichment twins by bare id (publisher prefix)', async () => {
    const service = createService()
    const provider = { id: 'ppio', modelListSource: 'api' }
    // Live /models returns the chat model with a flat id.
    const apiModels = [{ id: 'ppio::qwen3-235b-a22b-thinking-2507', apiModelId: 'qwen3-235b-a22b-thinking-2507' }]
    mockProviderGetByProviderId.mockReturnValue(provider)
    mockListModelsFromProvider.mockResolvedValue(apiModels)
    mockListProviderRegistryModels.mockReturnValue([
      // Same model as the API's, but registry keeps the publisher prefix → must dedup, not double-list.
      { id: 'ppio::qwen', apiModelId: 'qwen/qwen3-235b-a22b-thinking-2507', name: 'Qwen3 235B A22B Thinking' },
      // Vendor-exclusive image model the API never lists → must be appended.
      { id: 'ppio::z-image-turbo', apiModelId: 'z-image-turbo', name: 'Z-Image Turbo' }
    ])

    const result = await service.listModels({ providerId: 'ppio' })

    expect(result.map((m) => m.apiModelId)).toEqual(['qwen3-235b-a22b-thinking-2507', 'z-image-turbo'])
  })
})
