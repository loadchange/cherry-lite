# AI Reference

This is the entry point for the AI pipeline in Cherry Lite — the
main-process runtimes that own provider calls through the AI SDK, plus the
renderer-side transport that connects to them.

Lite keeps **chat and translate**. Agent sessions, Claude Code, IM channels,
skills, and knowledge-base tools were removed from the product. Some sibling
markdown files in this folder still describe those upstream pieces; treat them
as leftover, not current behavior.

## Quick navigation

### Top-level architecture

| Document | What it covers |
|---|---|
| [Core Architecture](./core-architecture.md) | End-to-end call flow: `Ai_Stream_Open` IPC → context provider → AiStreamManager → Agent loop → `@ai-sdk/*` → broadcast / persist |
| [Stream Manager](./stream-manager.md) | Active-stream registry, listeners, reconnect, abort, abort-and-restart steering, persistence backends |
| [Adapter Family](./adapter-family.md) | How `provider.endpointConfigs[ep].adapterFamily` picks the right `@ai-sdk/*` package per request |

### Subsystems

| Document | What it covers |
|---|---|
| [Agent Loop](./agent-loop.md) | Main-process `Agent.stream()`: single-pass stream, hook composition, observer pattern, error/abort semantics |
| [Params Pipeline](./params-pipeline.md) | `buildAgentParams` + `RequestFeature` model: how capabilities, plugins, tools, and provider-specific quirks are composed |
| [Tool Registry](./tool-registry.md) | Built-in tools (web search / web fetch / read file), MCP tools |
| [Chat Attachments](./chat-attachments.md) | How attached files reach the model: native file parts when supported, capped extracted text otherwise, `read_file` for overflow paging |
| [Provider Resolution](./provider-resolution.md) | `Provider.endpointConfigs` schema, endpoint resolution chain, variant suffixes, custom provider extensions (aihubmix, newapi) |
| [Observability (trace / telemetry)](./observability.md) | `AiSdkSpanAdapter`, root span propagation, OTel attribute shape, local span projection, sinks |
| [AI Usage Records](./ai-usage-records.md) | Best-effort per-provider-invocation usage/cost analytics: capture ownership, immutable attribution snapshots, message projection, bounded query API, migration, freshness |

### Renderer-side glue

| Document | What it covers |
|---|---|
| [IPC Transport](./ipc-transport.md) | `useChat` + `IpcChatTransport`: `sendMessages` / `reconnectToStream`, dispatch coordinator, topic-status mirror |
| [Execution Overlay](./execution-overlay.md) | `TopicStreamSubscription` + `useExecutionOverlay`: ref-counted attach, execution + anchor demux, one-shot `readUIMessageStream` per turn (the renderer half of the same merge function Main uses) |
| [Tool Approval](./tool-approval.md) | Approval registry, Main-as-writer model, persistent decisions, `useToolApproval` hook |

## Where the code lives

> **Scope of the focused docs.** The reference documents in this folder map
> the **chat / translate stream pipeline** (dispatch → stream manager → runtime →
> tools → persistence → renderer transport). MCP still lives under `src/main/ai/mcp/`.

```
src/main/ai/
├── AiService.ts                  ← lifecycle owner, IPC handlers (generate / translate / approval)
├── runtime/                      ← AI execution backends
│   └── aiSdk/                    ← Agent class, loop, observers, params/features, prompts/
├── streamManager/                ← AiStreamManager + listeners + persistence backends
│   ├── AiStreamManager.ts        ← registers the stream IPC (Open/Attach/Detach/Abort)
│   ├── context/                  ← ChatContextProvider implementations + dispatch
│   ├── lifecycle/                ← chat / prompt-only stream lifecycles
│   ├── listeners/                ← WebContents / Persistence
│   ├── persistence/              ← MessageService / TemporaryChat / Translation backends
│   └── pipeStreamLoop.ts         ← shared chunk-pipe primitive
├── provider/                     ← provider config, endpoint resolution, custom providers
│   ├── custom/                   ← aihubmix, newapi
│   ├── config.ts                 ← providerToAiSdkConfig (builder table)
│   ├── endpoint.ts               ← resolveEffectiveEndpoint + adapterFamily routing
│   ├── extensions/               ← ProviderExtension registrations
│   └── listModels.ts             ← per-provider model listing
├── mcp/                          ← McpRuntimeService / McpCatalogService, oauth/, built-in servers
│   └── servers/                  ← in-memory MCP server implementations (browser, filesystem)
├── tools/                        ← unified tool registry
│   └── adapters/
│       └── aiSdk/                ← builtin/ (web_search / web_fetch / read_file), mcp/
├── observability/                ← AI trace adapters, local projection, sinks
├── messages/                     ← UI part → AI SDK part conversion
├── types/                        ← AppProviderId, merged extension types, request types
└── utils/                        ← reasoning / model parameters / options / websearch helpers
```

## How a chat turn flows

1. Renderer `useChat({ transport: IpcChatTransport })` calls `sendMessages` →
   IPC `Ai_Stream_Open` (`{ topicId, trigger, userMessageParts, parentAnchorId?, mentionedModelIds? }`).
2. `AiStreamManager.onInit` registered the `Ai_Stream_Open` handler; it
   wraps the sender in a `WebContentsListener` and calls
   `dispatchStreamRequest(manager, subscriber, req)`. (The stream IPC —
   `Open`/`Attach`/`Detach`/`Abort` — lives on `AiStreamManager`, not
   `AiService`.)
3. `dispatchStreamRequest` picks the first `ChatContextProvider` whose
   `canHandle(topicId)` matches (persistent chat / temporary) and
   calls `prepareDispatch` — that resolves models, persists
   the user message, builds listeners, and returns a `PreparedDispatch`.
4. `AiStreamManager.send(input)` **starts** a turn (no active stream): creates
   an `ActiveStream`, launches one `StreamExecution` per model. (A chat
   resubmit on a live topic is persisted + queued as a steer and takes the
   **inject** path — the running turn yields and `onExecutionDone` chains a
   continuation.)
5. Each execution's `runExecutionLoop` calls `AiService.streamText(request,
   signal)`, which builds params (`buildAgentParams`) and constructs an `Agent`
   composing hooks from `RequestFeature[]` (anthropic cache, usage
   normalisation, reasoning extraction, …), then calls `agent.stream(messages,
   signal)` to open the AI SDK stream and yield `UIMessageChunk`s.
6. `pipeStreamLoop` tees the chunk stream: one branch broadcasts to listeners
   (WebContents / persistence), one branch runs
   `readUIMessageStream` to accumulate a `CherryUIMessage` snapshot.
7. On terminal (done / error / aborted / paused-for-approval), listeners get
   a typed terminal callback. `PersistenceListener` writes the final
   message via the appropriate `PersistenceBackend`.
8. Renderer reads the persisted row through `useQuery('/topics/:id/messages')`
   and disposes its overlay.

## Key invariants

- **Topic-level addressing.** Every IPC and broadcast is keyed by `topicId`.
  A topic has at most one active stream; subscribers are equal — there's no
  "owner" window.
- **Main owns persistence.** Renderer closing or crashing does not abort the
  stream and does not lose data — `PersistenceListener` writes on terminal
  regardless of who is listening.
- **Tool approval is Main-authoritative.** The renderer never writes
  `approved`/`denied` parts. It posts the decision over IPC and re-reads the
  authoritative row. See [Tool Approval](./tool-approval.md).
- **Adapter family per endpoint, not per provider.** Multi-endpoint relays
  (MiniMax, Silicon, AiHubMix, …) carry one `adapterFamily` per endpoint.
  Picking the SDK package never reads `apiHost` or provider id heuristics
  at request time. See [Adapter Family](./adapter-family.md).

## Related references

- [Service Lifecycle](../lifecycle/README.md) — `AiService` extends `BaseService`
- [Data Layer](../data/README.md) — `MessageService`, `ModelService`,
  `ProviderService` (called from main-side AI code)
- [Messaging](../messaging/message-system.md) — `CherryMessagePart`,
  `CherryUIMessage`, parts model
- [Window Manager](../window-manager/README.md) — `WebContentsListener`
  attaches to whatever windows are open

