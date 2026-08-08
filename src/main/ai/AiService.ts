import { application } from '@application'
import {
  type AiPlugin,
  embedMany as aiCoreEmbedMany,
  rerank as aiCoreRerank,
  type RuntimeProviderCallEvent,
  type RuntimeProviderCallHandler
} from '@cherrystudio/ai-core'
import {
  type AiUsageCaptureContext,
  aiUsageRecordService,
  type MessageRef,
  type SourceSnapshot
} from '@data/services/AiUsageRecordService'
import { assistantDataService } from '@data/services/AssistantService'
import { providerRegistryService } from '@data/services/ProviderRegistryService'
import { loggerService } from '@logger'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { messageService } from '@main/data/services/MessageService'
import { modelService } from '@main/data/services/ModelService'
import { providerService } from '@main/data/services/ProviderService'
import type { CompactionSink } from '@shared/ai/compaction'
import type { AiToolApprovalRespondRequest, AiToolApprovalRespondResponse } from '@shared/ai/transport'
import { type Assistant } from '@shared/data/types/assistant'
import { type Model, parseUniqueModelId } from '@shared/data/types/model'
import type { Provider } from '@shared/data/types/provider'
import { isEmbeddingModel, isFunctionCallingModel, isRerankModel } from '@shared/utils/model'
import {
  type EmbeddingModelUsage,
  isToolUIPart,
  type LanguageModelUsage,
  type ModelMessage,
  type UIMessageChunk
} from 'ai'

import { createAiUsagePlugin } from './hooks/billingHook'
import { prepareChatMessages } from './messages/attachmentRouting'
import { resolveMediaCapabilities } from './messages/messageCapabilities'
import { listModels as listModelsFromProvider } from './provider/listModels'
import type { AgentLoopHooks, RequestFeature } from './runtime/aiSdk'
import { Agent, buildAgentParams } from './runtime/aiSdk'
import { type MessageRuntimeTimingSink, WebContentsListener } from './streamManager'
import { registerBuiltinTools } from './tools/adapters/aiSdk/builtin/registerBuiltinTools'
import type {
  AiBaseRequest,
  AiStreamRequest,
  AiTransportOptions,
  AppProviderSettingsMap,
  InProcessUsageContext,
  ListModelsRequest
} from './types'
import { installProviderUserAgentInterceptor } from './utils/customFetch'
import { createAiUsageCaptureContext } from './utils/usageCapture'

const logger = loggerService.withContext('AiService')

// ── Model listing ──────────────────────────────────────────────────

/**
 * Bare model id used to dedup a live API list against the registry catalog: the
 * upstream `/models` strips the publisher prefix (`deepseek-v3.1-maas`) while the
 * registry keeps it (`deepseek-ai/deepseek-v3.1-maas`), so both collapse to the
 * last path segment, lowercased.
 * ponytail: last-segment + lowercase covers the known convention gap (publisher
 * prefix); widen (e.g. `.`→`-`) only if a real collision surfaces.
 */
function bareModelKey(apiModelId: string | undefined): string {
  const id = apiModelId ?? ''
  const afterSlash = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id
  return afterSlash.toLowerCase()
}

function sourceSnapshotForAssistant(assistant: Assistant | undefined): SourceSnapshot | undefined {
  return assistant
    ? {
        type: 'assistant',
        id: assistant.id,
        name: assistant.name,
        icon: assistant.emoji
      }
    : undefined
}

function createCaptureContext(input: {
  provider: Provider
  model: Model
  sdkModelId: string
  credentialReceipt: Parameters<typeof createAiUsageCaptureContext>[0]['credentialReceipt']
  source?: SourceSnapshot | null
  messageRef?: MessageRef | null
}): AiUsageCaptureContext {
  return createAiUsageCaptureContext({
    providerId: input.provider.id,
    providerName: input.provider.name,
    modelId: input.sdkModelId,
    modelName: input.model.name,
    pricing: input.model.pricing,
    trustProviderReportedCost: input.provider.apiFeatures.reportsActualCost,
    reportedCostCurrency: input.provider.reportedCostCurrency,
    credentialReceipt: input.credentialReceipt,
    source: input.source,
    messageRef: input.messageRef
  })
}

function createProviderCallHandler(context: AiUsageCaptureContext): RuntimeProviderCallHandler {
  return (event: RuntimeProviderCallEvent) => {
    aiUsageRecordService.recordInvocation({
      requestId: event.requestId,
      context,
      modality: event.modality,
      ...(event.modality === 'embedding' && event.usage
        ? { usage: { inputTokens: event.usage.tokens, totalTokens: event.usage.tokens } }
        : event.modality === 'image' && event.usage
          ? {
              usage: {
                ...(event.usage.inputTokens !== undefined ? { inputTokens: event.usage.inputTokens } : {}),
                ...(event.usage.outputTokens !== undefined ? { outputTokens: event.usage.outputTokens } : {}),
                ...(event.usage.totalTokens !== undefined ? { totalTokens: event.usage.totalTokens } : {})
              }
            }
          : {}),
      ...(event.modality === 'image' ? { imageCount: event.imageCount } : {}),
      metrics: event.metrics,
      completedAt: event.completedAt
    })
  }
}

/**
 * Union a provider's live API models with its registry catalog. Live models win;
 * registry models the API never returns are appended — vendor-exclusive entries
 * the upstream `/models` doesn't list (ppio's Z-Image/Jimeng image models,
 * Claude-on-Vertex). Enrichment-type overrides collapse onto their live twin via
 * `bareModelKey`, so only genuinely-missing models are added.
 */
export function mergeProviderModelsWithRegistry(remote: Partial<Model>[], registry: Model[]): Partial<Model>[] {
  const seen = new Set(remote.map((m) => bareModelKey(m.apiModelId)))
  const missing = registry.filter((m) => !seen.has(bareModelKey(m.apiModelId)))
  return missing.length > 0 ? [...remote, ...missing] : remote
}

// ── Request types ──────────────────────────────────────────────────

/** In-process variant of `AiTransportOptions` — adds `signal`, which is not IPC-serialisable. */
export interface AiRequestOptions extends AiTransportOptions {
  /** In-process only. Renderer payloads use `AiTransportOptions` (no signal). */
  signal?: AbortSignal
}

/** Widens `requestOptions` to accept the in-process shape on `AiService.*` method signatures. */
export type AsInProcess<T extends AiBaseRequest> = Omit<T, 'requestOptions'> & {
  requestOptions?: AiRequestOptions
  usageContext?: InProcessUsageContext
  runtimeTimingSink?: MessageRuntimeTimingSink
  /**
   * Emits compaction lifecycle events as `data-compaction-anchor` chunks.
   * In-process only (a closure), same as `runtimeTimingSink` — the stream
   * manager supplies it because only it can reach the turn's chunk sink.
   */
  compactionSink?: CompactionSink
}

/** Non-streaming text generation request — pure transport data. */
export interface AiGenerateRequest extends AiBaseRequest {
  system?: string
  prompt?: string
  messages?: ModelMessage[]
}

// ── SDK extensions ─────────────────────────────────────────────────

/** Result of non-streaming text generation. */
export interface AiGenerateResult {
  text: string
  usage?: LanguageModelUsage
}

/** Embedding request. */
export interface AiEmbedRequest extends AiBaseRequest {
  values: string[]
}

/** Embedding result. */
export interface AiEmbedResult {
  embeddings: number[][]
  usage?: EmbeddingModelUsage
}

export interface AiRerankRequest extends AiBaseRequest {
  query: string
  documents: string[]
  topN?: number
}

export interface AiRerankResult {
  ranking: Array<{
    originalIndex: number
    score: number
  }>
}

// ── Service ────────────────────────────────────────────────────────

/**
 * Lifecycle AI service. See `docs/references/ai/core-architecture.md`.
 *
 * DO NOT mirror `@DependsOn(['AiService'])` on AiStreamManager —
 * `runExecutionLoop` looks AiService up at runtime, and every `send()`
 * caller routes through AiService first.
 */
@Injectable('AiService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['McpRuntimeService', 'McpCatalogService', 'AiStreamManager', 'JobManager'])
export class AiService extends BaseService {
  protected async onInit(): Promise<void> {
    registerBuiltinTools()
    // Restore provider custom `User-Agent` headers that Chromium's net.fetch stack
    // would otherwise overwrite (see installProviderUserAgentInterceptor).
    this.registerDisposable(installProviderUserAgentInterceptor())
    logger.info('AiService initialized')
  }

  /**
   * Apply a tool-approval decision (`ai.tool.respond_approval`). Input validation happens in the
   * IpcApi router; `senderWc` is the caller window's WebContents (the MCP continuation streams to
   * it), resolved by the handler from `ctx.senderId` — `undefined` when no managed window, in which
   * case the continuation can't be surfaced and we resolve `{ ok: false }`.
   */
  async respondToolApproval(
    payload: AiToolApprovalRespondRequest,
    senderWc: Electron.WebContents | undefined
  ): Promise<AiToolApprovalRespondResponse> {
    // MCP path: write decisions to DB, then dispatch continue-conversation when nothing is pending.
    if (!payload.topicId || !payload.anchorId) {
      logger.warn('Tool-approval response had no live registry entry and no anchor context', {
        approvalId: payload.approvalId
      })
      return { ok: false }
    }

    // The approval card is clickable the moment the `tool-approval-request` chunk arrives (the live
    // overlay), not only at terminal. So a response can land while a stream is still live on this
    // topic — a sibling exec in a multi-model turn, or another approved continuation already
    // running. The continue-conversation dispatch below would then hit send()'s inject path and
    // silently discard the approved turn (its models dropped, the tool never runs, the row stays
    // `pending`) while still returning a success-shaped response. This cheap pre-check refuses the
    // common case before mutating the row; the narrow TOCTOU that slips through (a submit starts a
    // turn between here and the dispatch) is closed under the dispatch lock by send() throwing,
    // caught below. The renderer surfaces the failure and resets the card; this backend slice does
    // not promise an automatic retry.
    if (application.get('AiStreamManager').hasLiveStream(payload.topicId)) {
      logger.warn(
        'Tool-approval response arrived while a stream is live — refusing to avoid a swallowed continuation',
        {
          approvalId: payload.approvalId,
          topicId: payload.topicId
        }
      )
      return { ok: false }
    }

    // Main is the single authority for the approval mutation: the
    // renderer no longer PATCHes (it sourced parts from a DB projection
    // that didn't carry the overlay-only `approval-requested` part and
    // raced/overwrote the persisted row). The decision is carried
    // explicitly in the IPC payload; apply it here to the DB-authoritative
    // parts (the original stream's terminal persistence wrote the
    // `approval-requested` part onto this row) and persist.
    const decision = {
      approvalId: payload.approvalId,
      approved: payload.approved,
      ...(payload.reason !== undefined && { reason: payload.reason }),
      ...(payload.updatedInput !== undefined && { updatedInput: payload.updatedInput })
    }
    // A stale click on a deleted message must resolve through the documented
    // result shape, not throw out of the handler (getById rejects when the
    // anchor is missing), consistent with the no-context branch above.
    // Serialize the parts mutation per anchor inside one write transaction: a multi-tool turn can
    // request several approvals on one row, and two concurrent responses must not read the same
    // stale parts and clobber each other's decision (or both compute a stale "still pending" and
    // neither resume). Returns the committed parts, or null when the anchor row is gone — a stale
    // click on a deleted message, resolved through the result shape instead of throwing.
    const approvalResult = messageService.applyToolApprovalDecisions(payload.anchorId, [decision])
    if (approvalResult === null) {
      logger.warn('Tool-approval response anchor is missing or deleted', {
        approvalId: payload.approvalId,
        anchorId: payload.anchorId
      })
      return { ok: false }
    }
    const { parts: committedParts, appliedApprovalIds, alreadySettledApprovalIds } = approvalResult
    if (appliedApprovalIds.length === 0 && alreadySettledApprovalIds.includes(decision.approvalId)) {
      logger.warn('Ignoring duplicate tool-approval response for an already-settled approval', {
        approvalId: decision.approvalId,
        anchorId: payload.anchorId
      })
      return { ok: true }
    }
    // Only resume once every approval on this turn is decided — a turn can request several tools
    // at once; the not-yet-decided ones keep their cards. Reading the committed post-write parts
    // means concurrent responders agree on who fires the continuation.
    const anyStillPending = committedParts.some((p) => isToolUIPart(p) && p.state === 'approval-requested')
    if (anyStillPending) {
      return { ok: true }
    }

    // The continuation needs a renderer to stream to; without the caller window there's nothing to
    // surface it on, so resolve through the result shape instead of dispatching into the void.
    if (!senderWc) {
      logger.warn('Tool-approval continuation skipped: no caller window', { approvalId: payload.approvalId })
      return { ok: false }
    }

    const aiStreamManager = application.get('AiStreamManager')
    const subscriber = new WebContentsListener(senderWc, payload.topicId)
    try {
      await aiStreamManager.dispatch(subscriber, {
        trigger: 'continue-conversation',
        topicId: payload.topicId,
        parentAnchorId: payload.anchorId,
        // Idempotent against the conditional write above; safety net when the part wasn't on the row.
        approvalDecisions: [decision]
      })
    } catch (error) {
      // dispatch runs prepareDispatch+send under the per-topic dispatch lock. If a concurrent submit
      // started a live turn after the hasLiveStream pre-check above, send() refuses to inject-drop the
      // prepared continuation (throws) rather than swallowing it with a success shape. Resolve through
      // the result shape so the renderer can reset the card instead of leaving it stuck submitting.
      logger.warn('Tool-approval continuation dispatch failed (likely raced a live submit)', {
        approvalId: payload.approvalId,
        topicId: payload.topicId,
        error: error instanceof Error ? error.message : String(error)
      })
      return { ok: false }
    }
    return { ok: true }
  }

  // ── Streaming chat (agent.stream) ──

  /**
   * Raw `UIMessageChunk` stream from `Agent.stream`. Caller (usually
   * `AiStreamManager`) owns read/multicast/accumulation/terminal dispatch.
   * Pre-stream errors reject the Promise; mid-stream errors come through
   * the stream itself.
   */
  async streamText(
    request: AsInProcess<AiStreamRequest>,
    extraFeatures: readonly RequestFeature[] = []
  ): Promise<ReadableStream<UIMessageChunk>> {
    logger.info('streamText started', { chatId: request.chatId })
    const signal = request.requestOptions?.signal
    if (!signal) {
      throw new Error('streamText requires requestOptions.signal — no AbortController was attached by the caller')
    }

    const repairUsagePlugins: { current?: AiPlugin[] } = {}
    const {
      sdkConfig,
      credentialReceipt,
      tools,
      plugins,
      system,
      options,
      provider,
      model,
      assistant,
      hookParts,
      nativeFileSupport,
      fileAttachments
    } = await this.buildAgentParamsFor(request, signal, extraFeatures, () => repairUsagePlugins.current ?? [])
    const usageContext = createCaptureContext({
      provider,
      model,
      sdkModelId: sdkConfig.modelId,
      credentialReceipt,
      source: request.usageContext ? request.usageContext.source : sourceSnapshotForAssistant(assistant),
      messageRef: request.usageContext
        ? { kind: 'agent-session', id: request.usageContext.assistantMessageId }
        : request.messageId
          ? { kind: 'chat', id: request.messageId }
          : null
    })
    const usagePlugin = createAiUsagePlugin(usageContext)
    repairUsagePlugins.current = [usagePlugin]

    // Route attachments: native files stay inline, non-native become capped text
    // (always visible — never gated on the model calling read_file).
    const preparedMessages = await prepareChatMessages(request.messages ?? [], {
      attachments: fileAttachments,
      nativeSupport: nativeFileSupport,
      isToolCapable: isFunctionCallingModel(model),
      signal
    })

    const agent = new Agent({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      messageId: request.messageId,
      plugins: [...plugins, usagePlugin],
      tools,
      system,
      options,
      hookParts: [
        ...(request.runtimeTimingSink
          ? [
              {
                onToolExecutionStart: (event) => request.runtimeTimingSink?.onToolExecutionStart(event),
                onToolExecutionEnd: (event) => request.runtimeTimingSink?.onToolExecutionEnd(event)
              } satisfies Partial<AgentLoopHooks>
            ]
          : []),
        ...hookParts
      ],
      mediaCapabilities: resolveMediaCapabilities(model)
    })

    return agent.stream(preparedMessages, signal)
  }

  // ── Non-streaming text generation (agent.generate) ──

  async generateText(
    request: AsInProcess<AiGenerateRequest>,
    extraFeatures: readonly RequestFeature[] = []
  ): Promise<AiGenerateResult> {
    logger.info('generateText started', { assistantId: request.assistantId })
    const signal = request.requestOptions?.signal

    const repairUsagePlugins: { current?: AiPlugin[] } = {}
    const { sdkConfig, credentialReceipt, tools, plugins, system, options, provider, model, assistant, hookParts } =
      await this.buildAgentParamsFor(request, signal, extraFeatures, () => repairUsagePlugins.current ?? [])
    const usageContext = createCaptureContext({
      provider,
      model,
      sdkModelId: sdkConfig.modelId,
      credentialReceipt,
      source: sourceSnapshotForAssistant(assistant),
      messageRef: null
    })
    const usagePlugin = createAiUsagePlugin(usageContext)
    repairUsagePlugins.current = [usagePlugin]

    const agent = new Agent({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      plugins: [...plugins, usagePlugin],
      tools,
      system: request.system ?? system,
      options,
      hookParts
    })

    // prompt and messages are mutually exclusive in AI SDK; preserve that.
    return agent.generate(request.prompt ? { prompt: request.prompt } : { messages: request.messages ?? [] }, signal)
  }

  // ── Embedding ──

  async embedMany(request: AsInProcess<AiEmbedRequest>): Promise<AiEmbedResult> {
    logger.info('embedMany started', { assistantId: request.assistantId, count: request.values.length })
    const signal = request.requestOptions?.signal

    const { sdkConfig, credentialReceipt, provider, model, assistant } = await this.buildAgentParamsFor(request, signal)
    const usageContext = createCaptureContext({
      provider,
      model,
      sdkModelId: sdkConfig.modelId,
      credentialReceipt,
      source: sourceSnapshotForAssistant(assistant),
      messageRef: null
    })

    const result = await aiCoreEmbedMany<AppProviderSettingsMap>(sdkConfig.providerId, sdkConfig.providerSettings, {
      model: sdkConfig.modelId,
      values: request.values,
      onProviderCall: createProviderCallHandler(usageContext),
      ...(signal ? { abortSignal: signal } : {})
    })

    return { embeddings: result.embeddings, usage: result.usage }
  }

  // ── Reranking ──

  async rerank(request: AsInProcess<AiRerankRequest>): Promise<AiRerankResult> {
    logger.info('rerank started', { assistantId: request.assistantId, count: request.documents.length })
    const signal = request.requestOptions?.signal

    const {
      sdkConfig,
      credentialReceipt,
      options = {},
      provider,
      model,
      assistant
    } = await this.buildAgentParamsFor(request, signal)
    const usageContext = createCaptureContext({
      provider,
      model,
      sdkModelId: sdkConfig.modelId,
      credentialReceipt,
      source: sourceSnapshotForAssistant(assistant),
      messageRef: null
    })
    const headers = options.headers
      ? (Object.fromEntries(Object.entries(options.headers).filter(([, value]) => value !== undefined)) as Record<
          string,
          string
        >)
      : undefined

    const rerankParams = {
      model: sdkConfig.modelId,
      query: request.query,
      documents: request.documents,
      ...(request.topN !== undefined ? { topN: request.topN } : {}),
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      onProviderCall: createProviderCallHandler(usageContext),
      ...(signal ? { abortSignal: signal } : {})
    }

    const result = await aiCoreRerank<AppProviderSettingsMap>(
      sdkConfig.providerId,
      sdkConfig.providerSettings,
      rerankParams
    )

    return {
      ranking: result.ranking.map((item) => ({
        originalIndex: item.originalIndex,
        score: item.score
      }))
    }
  }

  // ── Model listing ──
  async listModels(request: ListModelsRequest): Promise<Partial<Model>[]> {
    let providerId = request.providerId
    if (!providerId && request.assistantId) {
      let assistant: Assistant | undefined
      try {
        assistant = assistantDataService.getById(request.assistantId)
      } catch {
        assistant = undefined
      }
      if (assistant?.modelId) {
        providerId = parseUniqueModelId(assistant.modelId).providerId
      }
    }
    if (!providerId) {
      throw new Error('Cannot resolve providerId: not in request and assistant has no model')
    }
    const provider = providerService.getByProviderId(providerId)
    // Registry-sourced providers (login-based, no API model list) return their
    // shipped catalog instead of calling the upstream API. The rest of the pull
    // flow (enrich → reconcile → enable) is unchanged.
    if (provider.modelListSource === 'registry') {
      return providerRegistryService.listProviderRegistryModels({
        providerId,
        presetProviderId: provider.presetProviderId ?? null
      })
    }
    // Union the live API list with the registry catalog so vendor-exclusive models
    // the upstream `/models` never returns (ppio image models, Claude-on-Vertex)
    // still surface for the user to enable.
    const remoteModels = await listModelsFromProvider(provider, undefined, { throwOnError: request.throwOnError })
    const registryModels = providerRegistryService.listProviderRegistryModels({
      providerId,
      presetProviderId: provider.presetProviderId ?? null
    })
    return mergeProviderModelsWithRegistry(remoteModels, registryModels)
  }

  // ── API validation ──

  /** Dispatches to `rerank` / `embedMany` for those model types, `generateText` otherwise. */
  async checkModel(request: AiBaseRequest & { timeout?: number }): Promise<{ latency: number }> {
    const { model } = this.getProviderAndModel(request)
    const start = performance.now()
    const timeout = request.timeout ?? 15000

    // AbortController on timeout so the HTTP work cancels too (otherwise tokens keep burning).
    const controller = new AbortController()
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort(new Error('Check model timeout'))
        reject(new Error('Check model timeout'))
      }, timeout)
    })

    const probeRequest = {
      ...request,
      requestOptions: { ...request.requestOptions, signal: controller.signal }
    }
    let probe: Promise<unknown>
    if (isRerankModel(model)) {
      probe = this.rerank({ ...probeRequest, query: 'test', documents: ['test'], topN: 1 }).then((result) => {
        if (result.ranking.length === 0) {
          throw new Error('Rerank health check returned empty ranking')
        }
        return result
      })
    } else if (isEmbeddingModel(model)) {
      probe = this.embedMany({ ...probeRequest, values: ['test'] })
    } else {
      probe = this.generateText({ ...probeRequest, system: 'test', prompt: 'hi' })
    }

    try {
      await Promise.race([probe, timeoutPromise])
      return { latency: performance.now() - start }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
  }

  // ── Shared agent parameter resolution ──

  private async buildAgentParamsFor(
    request: AsInProcess<AiBaseRequest> & { chatId?: string },
    signal: AbortSignal | undefined,
    extraFeatures: readonly RequestFeature[] = [],
    getRepairUsagePlugins?: () => AiPlugin[]
  ) {
    const { provider, model, assistant } = this.getProviderAndModel(request)
    const built = await buildAgentParams({
      request,
      signal,
      provider,
      model,
      assistant,
      extraFeatures,
      getRepairUsagePlugins,
      compactionSink: request.compactionSink
    })
    return { ...built, provider, model, assistant }
  }

  /** Priority: explicit `uniqueModelId` > `assistant.modelId`. */
  private getProviderAndModel(request: AiBaseRequest & { chatId?: string }) {
    let assistant: Assistant | undefined
    if (request.assistantId) {
      try {
        assistant = assistantDataService.getById(request.assistantId)
      } catch {
        assistant = undefined
      }
    }

    let providerId: string | undefined
    let modelId: string | undefined
    if (request.uniqueModelId) {
      const parsed = parseUniqueModelId(request.uniqueModelId)
      providerId = parsed.providerId
      modelId = parsed.modelId
    } else if (assistant?.modelId) {
      const parsed = parseUniqueModelId(assistant.modelId)
      providerId = parsed.providerId
      modelId = parsed.modelId
    }
    if (!providerId) throw new Error('Cannot resolve providerId: not in request and assistant has no model')
    if (!modelId) throw new Error('Cannot resolve modelId: not in request and assistant has no model')

    const provider = providerService.getByProviderId(providerId)
    const model = modelService.getByKey(providerId, modelId)

    return { provider, model, assistant }
  }
}
