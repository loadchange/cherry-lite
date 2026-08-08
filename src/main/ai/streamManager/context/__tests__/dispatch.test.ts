import type { ReasoningEffortOption } from '@shared/types/aiSdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AiStreamManager } from '../../AiStreamManager'
import type { StreamListener } from '../../types'
import type { MainDispatchRequest } from '../dispatch'

// Records the relative order of the steps we care about (prepareDispatch / enqueue / send).
const order: string[] = []
// Captures the `hasLiveStream` flag the provider receives in its ctx arg.
let preparedWithCtx: { hasLiveStream: boolean } | undefined

const mocks = vi.hoisted(() => ({
  persistentPrepare: vi.fn()
}))

vi.mock('../TemporaryChatContextProvider', () => ({
  temporaryChatContextProvider: { name: 'temporary', canHandle: () => false, prepareDispatch: vi.fn() }
}))
vi.mock('../PersistentChatContextProvider', () => ({
  persistentChatContextProvider: {
    name: 'persistent',
    canHandle: () => true,
    prepareDispatch: mocks.persistentPrepare
  }
}))

const { dispatchStreamRequest } = await import('../dispatch')

function makeSubscriber(): StreamListener {
  return { id: 'wc:1', onChunk: vi.fn(), onDone: vi.fn(), onPaused: vi.fn(), onError: vi.fn(), isAlive: () => true }
}

function makeManager(live: boolean): AiStreamManager {
  return {
    hasLiveStream: vi.fn(() => live),
    enqueuePendingSteer: vi.fn(() => order.push('enqueuePendingSteer')),
    send: vi.fn(() => {
      order.push('send')
      return { mode: live ? ('injected' as const) : ('started' as const), executionIds: [] }
    })
  } as unknown as AiStreamManager
}

/** `inject: true` mirrors PersistentChatContextProvider's `hasLiveStream` branch — no models + a user row. */
function wirePrepare(
  spy: typeof mocks.persistentPrepare,
  topicId: string,
  opts: { inject: boolean; steer?: boolean; reasoningEffort?: ReasoningEffortOption; fastMode?: boolean }
) {
  spy.mockImplementation((_subscriber: StreamListener, _req: MainDispatchRequest, ctx: { hasLiveStream: boolean }) => {
    order.push('prepareDispatch')
    preparedWithCtx = ctx
    return Promise.resolve({
      topicId,
      models: opts.inject ? [] : [{ modelId: 'p::m', request: {} }],
      listeners: [] as StreamListener[],
      isMultiModel: false,
      userMessageId: 'u1',
      // Only the persistent steer branch sets this explicit marker; the dispatcher enqueues off it.
      pendingSteerUserMessageId: opts.steer ? 'u1' : undefined,
      pendingSteerReasoningEffort: opts.reasoningEffort,
      pendingSteerFastMode: opts.fastMode
    })
  })
}

const chatReq = (topicId: string): MainDispatchRequest =>
  ({ topicId, trigger: 'submit-message', userMessageParts: [] }) as unknown as MainDispatchRequest

beforeEach(() => {
  order.length = 0
  preparedWithCtx = undefined
  vi.clearAllMocks()
})

describe('dispatchStreamRequest — steer', () => {
  it('persists a live chat submit as a steer and enqueues it (no abort, stream stays live)', async () => {
    wirePrepare(mocks.persistentPrepare, 'topic-1', { inject: true, steer: true, reasoningEffort: 'high' })
    const manager = makeManager(true)

    await dispatchStreamRequest(manager, makeSubscriber(), chatReq('topic-1'))

    // No abort/evict — prepareDispatch observes the still-live stream and takes its inject branch,
    // and the persisted user row is enqueued as a pending steer before send (which just attaches).
    expect(preparedWithCtx).toEqual({ hasLiveStream: true })
    expect(order).toEqual(['prepareDispatch', 'enqueuePendingSteer', 'send'])
    expect(manager.enqueuePendingSteer).toHaveBeenCalledWith('topic-1', 'u1', 'high', false)
  })

  it('carries Fast into a queued steer continuation', async () => {
    wirePrepare(mocks.persistentPrepare, 'topic-fast', {
      inject: true,
      steer: true,
      reasoningEffort: 'high',
      fastMode: true
    })
    const manager = makeManager(true)

    await dispatchStreamRequest(manager, makeSubscriber(), chatReq('topic-fast'))

    expect(manager.enqueuePendingSteer).toHaveBeenCalledWith('topic-fast', 'u1', 'high', true)
  })

  it('does not enqueue a steer for a non-live chat submit (normal turn opens models)', async () => {
    wirePrepare(mocks.persistentPrepare, 'topic-2', { inject: false })
    const manager = makeManager(false)

    await dispatchStreamRequest(manager, makeSubscriber(), chatReq('topic-2'))

    expect(manager.enqueuePendingSteer).not.toHaveBeenCalled()
    expect(order).toEqual(['prepareDispatch', 'send'])
    expect(preparedWithCtx).toEqual({ hasLiveStream: false })
  })

  it('rethrows a prepareDispatch error and does not send', async () => {
    mocks.persistentPrepare.mockRejectedValue(new Error('boom'))
    const manager = makeManager(true)

    await expect(dispatchStreamRequest(manager, makeSubscriber(), chatReq('topic-4'))).rejects.toThrow('boom')
    expect(manager.send).not.toHaveBeenCalled()
  })

  it('validates multi-model placeholders before sending', async () => {
    mocks.persistentPrepare.mockResolvedValue({
      topicId: 'topic-3',
      models: [
        { modelId: 'p::m1', request: { messageId: 'assistant-1' } },
        { modelId: 'p::m2', request: {} }
      ],
      listeners: [] as StreamListener[],
      isMultiModel: true
    })
    const manager = makeManager(false)

    await expect(dispatchStreamRequest(manager, makeSubscriber(), chatReq('topic-3'))).rejects.toThrow(
      'Multi-model dispatch produced 1 placeholderIds for 2 models'
    )
    expect(manager.send).not.toHaveBeenCalled()
  })
})
