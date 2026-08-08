import type {
  AiStreamAttachResponse,
  AiStreamOpenResponse,
  AiToolApprovalRespondRequest,
  AiToolResultRequest,
  AiToolResultResponse,
  StreamChunkPayload,
  StreamDonePayload,
  StreamErrorPayload
} from '@shared/ai/transport'
import type { CherryMessagePart } from '@shared/data/types/message'
import { ModelSchema, UniqueModelIdSchema } from '@shared/data/types/model'
import { ReasoningEffortOptionSchema } from '@shared/types/aiSdk'
import type { EmbeddingModelUsage, LanguageModelUsage, ModelMessage } from 'ai'
import * as z from 'zod'

import { defineRoute } from '../define'

/**
 * AI IPC schemas — `AiService`'s non-streaming model operations (text/embedding
 * generation, model probe, model listing) plus the `AiStreamManager` streaming-chat
 * link (open/attach/detach/abort requests + chunk/done/error events). Each route
 * delegates to a stateful service method in main.
 *
 * Routes are namespaced `ai.<subdomain>[.<resource>].<verb>` — the subtree groups by
 * domain, not by owning service: `text` / `embedding` (one-shot calls by
 * output modality), `provider.model` (catalog + probe), `stream` (chat link and its
 * events), `tool` (deferred results, approvals), and `topic` (auto-naming events).
 *
 * Inputs mirror the **wire shape** the renderer actually sends, i.e. the
 * clone-safe subset of the in-process request types: the in-process-only
 * `AbortSignal`, `callOverrides` (an AI SDK `ToolSet`, not structured-clone-safe),
 * and main-internal `contextOwner` are deliberately absent. Outputs reuse the canonical entity schemas
 * (`FileEntrySchema`, `ModelSchema`) where they exist and `z.custom<T>()` for opaque
 * AI SDK / transport types (usage, stream responses) — the router never parses
 * `output`, and these are built by trusted main, so a field mirror buys nothing
 * (see ipc-migration-guide.md).
 */

/** Clone-safe subset of `AiTransportOptions` (no signal). */
const aiTransportOptionsSchema = z.object({
  headers: z.record(z.string(), z.string().optional()).optional(),
  timeout: z.number().optional(),
  maxRetries: z.number().optional()
})

/** Clone-safe subset of `AiBaseRequest` shared by the text / embed routes. */
const aiBaseRequestShape = {
  assistantId: z.string().optional(),
  // Strict `providerId::modelId` validation (separator at a real position, both
  // parts well-formed) — a malformed id is rejected here instead of throwing later
  // in `parseUniqueModelId`. The brand `z.custom<UniqueModelId>` alone only checked
  // string-ness, letting a bad id penetrate to the routing code.
  uniqueModelId: UniqueModelIdSchema.optional(),
  mcpToolIds: z.array(z.string()).optional(),
  requestOptions: aiTransportOptionsSchema.optional()
}

export const aiRequestSchemas = {
  // ── One-shot model calls, grouped by output modality (AiService) ──
  'ai.text.generate': defineRoute({
    input: z.strictObject({
      ...aiBaseRequestShape,
      system: z.string().optional(),
      prompt: z.string().optional(),
      messages: z.array(z.custom<ModelMessage>()).optional()
    }),
    output: z.object({ text: z.string(), usage: z.custom<LanguageModelUsage>().optional() })
  }),
  'ai.embedding.embed_many': defineRoute({
    input: z.strictObject({ ...aiBaseRequestShape, values: z.array(z.string()) }),
    output: z.object({ embeddings: z.array(z.array(z.number())), usage: z.custom<EmbeddingModelUsage>().optional() })
  }),
  // ── Provider model catalog & reachability probe (AiService) ──
  'ai.provider.model.list': defineRoute({
    input: z.strictObject({
      providerId: z.string().optional(),
      assistantId: z.string().optional(),
      throwOnError: z.boolean().optional()
    }),
    output: z.array(ModelSchema.partial())
  }),
  'ai.provider.model.check': defineRoute({
    input: z.strictObject({
      ...aiBaseRequestShape,
      apiKeyOverride: z.string().optional(),
      timeout: z.number().optional()
    }),
    output: z.object({ latency: z.number() })
  }),

  // ── Streaming chat (AiStreamManager) ──
  // Requests are R→M; the produced chunk/done/error events ride the AiEventSchemas block below.
  'ai.stream.open': defineRoute({
    // Discriminated by `trigger`, mirroring AiStreamOpenRequest. `userMessageParts` is opaque
    // pass-through (main persists it), so its items are `z.custom<CherryMessagePart>()`.
    input: z.intersection(
      z.object({
        topicId: z.string().min(1),
        mentionedModelIds: z.array(UniqueModelIdSchema).optional()
      }),
      z.discriminatedUnion('trigger', [
        z.object({
          trigger: z.literal('submit-message'),
          parentAnchorId: z.string().optional(),
          userMessageParts: z.array(z.custom<CherryMessagePart>()),
          reasoningEffort: ReasoningEffortOptionSchema.optional(),
          fastMode: z.boolean().optional()
        }),
        z.object({
          trigger: z.literal('regenerate-message'),
          parentAnchorId: z.string().min(1),
          reasoningEffort: ReasoningEffortOptionSchema.optional(),
          fastMode: z.boolean().optional()
        })
      ])
    ),
    output: z.custom<AiStreamOpenResponse>()
  }),
  'ai.stream.attach': defineRoute({
    input: z.strictObject({ topicId: z.string().min(1) }),
    output: z.custom<AiStreamAttachResponse>()
  }),
  'ai.stream.detach': defineRoute({
    input: z.strictObject({ topicId: z.string().min(1) }),
    output: z.void()
  }),
  'ai.stream.abort': defineRoute({
    input: z.strictObject({ topicId: z.string().min(1) }),
    output: z.void()
  }),

  // ── Tool calls: deferred results + approval decisions. Spans two owners
  // (AiStreamManager holds the live output, AiService applies the decision) —
  // the subtree groups by domain, not by service.
  'ai.tool.get_result': defineRoute({
    // Mirrors AiToolResultRequest (z.ZodType pins exact-shape drift here, not in a test).
    input: z.strictObject({
      topicId: z.string().min(1),
      messageId: z.string().min(1),
      toolCallId: z.string().min(1)
    }) satisfies z.ZodType<AiToolResultRequest>,
    output: z.custom<AiToolResultResponse>()
  }),
  'ai.tool.respond_approval': defineRoute({
    // Mirrors AiToolApprovalRespondRequest (z.ZodType pins exact-shape drift here, not in a test).
    // strictObject for parity with the model-op routes — reject unknown keys rather than strip them.
    input: z.strictObject({
      approvalId: z.string().min(1),
      approved: z.boolean(),
      reason: z.string().optional(),
      updatedInput: z.record(z.string(), z.unknown()).optional(),
      topicId: z.string().optional(),
      anchorId: z.string().optional()
    }) satisfies z.ZodType<AiToolApprovalRespondRequest>,
    output: z.object({ ok: z.boolean() })
  })
}

/**
 * AI events (M→R, pure types — main is the TCB that builds them). High-frequency topic
 * streams: `AiStreamManager`'s per-(topic,window) `WebContentsListener` emits these via
 * directed `webContents.send` on the IpcApi event channel (class-B topic stream), keeping
 * its coalescing/liveness intact — it does not `broadcast`.
 */
export type AiEventSchemas = {
  'ai.stream.chunk': StreamChunkPayload
  'ai.stream.done': StreamDonePayload
  'ai.stream.error': StreamErrorPayload
  // Auto-rename push (broadcast): a background job renamed a topic; any window
  // showing it should invalidate its cache.
  'ai.topic.auto_renamed': { topicId: string }
  // Auto-rename failure (broadcastToType Main): a background naming job's summarization call
  // failed (e.g. the naming model returned an auth error). Delivered to the main window only
  // — the job has no origin window — which surfaces it as a toast so the failure isn't silent.
  'ai.topic.naming_failed': { message: string }
}
