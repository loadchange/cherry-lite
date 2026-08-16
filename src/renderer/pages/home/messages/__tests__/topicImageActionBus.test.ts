import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { Topic } from '@renderer/types/topic'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPendingTopicImageActionsForTest,
  consumePendingTopicImageActions,
  rejectPendingTopicImageActions,
  requestTopicImageAction,
  settleTopicImageActionRequest
} from '../topicImageActionBus'

vi.mock('@renderer/services/EventService', () => ({
  EVENT_NAMES: {
    COPY_TOPIC_IMAGE: 'COPY_TOPIC_IMAGE'
  },
  EventEmitter: {
    emit: vi.fn()
  }
}))

const topic = { id: 'topic-a', name: 'Topic A' } as Topic
const otherTopic = { ...topic, id: 'topic-b' }

describe('topicImageActionBus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearPendingTopicImageActionsForTest()
  })

  it('buffers topic image requests before broadcasting the event', () => {
    const request = requestTopicImageAction('copy', topic)

    expect(EventEmitter.emit).toHaveBeenCalledWith(EVENT_NAMES.COPY_TOPIC_IMAGE, topic)
    expect(consumePendingTopicImageActions('topic-a')).toEqual([
      expect.objectContaining({ id: request.id, topic, type: 'copy', promise: expect.any(Promise) })
    ])
  })

  it('can buffer topic image requests without broadcasting the event', () => {
    const request = requestTopicImageAction('copy', topic, { emit: false })

    expect(EventEmitter.emit).not.toHaveBeenCalled()
    expect(consumePendingTopicImageActions('topic-a')).toEqual([
      expect.objectContaining({ id: request.id, topic, type: 'copy', promise: expect.any(Promise) })
    ])
  })

  it('consumes only matching topic requests', () => {
    requestTopicImageAction('copy', topic)
    requestTopicImageAction('copy', otherTopic)

    expect(consumePendingTopicImageActions('topic-a')).toEqual([expect.objectContaining({ topic, type: 'copy' })])
    expect(consumePendingTopicImageActions('topic-b')).toEqual([
      expect.objectContaining({ topic: expect.objectContaining({ id: 'topic-b' }), type: 'copy' })
    ])
  })

  it('settles the request promise when the runtime action resolves', async () => {
    const request = requestTopicImageAction('copy', topic)
    const actionPromise = Promise.resolve()

    settleTopicImageActionRequest(request, actionPromise)

    await expect(request.promise).resolves.toBeUndefined()
  })

  it('rejects the request promise when the runtime action rejects', async () => {
    const request = requestTopicImageAction('copy', topic)
    const error = new Error('copy failed')

    settleTopicImageActionRequest(request, Promise.reject(error))

    await expect(request.promise).rejects.toBe(error)
  })

  it('rejects and removes pending requests when they are cancelled', async () => {
    const request = requestTopicImageAction('copy', topic)
    const error = new Error('cancelled')

    rejectPendingTopicImageActions('topic-a', error)

    await expect(request.promise).rejects.toBe(error)
    expect(consumePendingTopicImageActions('topic-a')).toEqual([])
  })

  it('only cancels pending requests for the selected topic', async () => {
    const requestA = requestTopicImageAction('copy', topic)
    const requestB = requestTopicImageAction('copy', otherTopic)
    const error = new Error('cancelled')

    rejectPendingTopicImageActions('topic-a', error)

    await expect(requestA.promise).rejects.toBe(error)
    expect(consumePendingTopicImageActions('topic-a')).toEqual([])
    expect(consumePendingTopicImageActions('topic-b')).toEqual([
      expect.objectContaining({ id: requestB.id, type: 'copy' })
    ])
  })

  it('cancels all pending requests when no topic id is provided', async () => {
    const requestA = requestTopicImageAction('copy', topic)
    const requestB = requestTopicImageAction('copy', otherTopic)
    const error = new Error('cancelled')

    rejectPendingTopicImageActions(undefined, error)

    await expect(requestA.promise).rejects.toBe(error)
    await expect(requestB.promise).rejects.toBe(error)
    expect(consumePendingTopicImageActions('topic-a')).toEqual([])
    expect(consumePendingTopicImageActions('topic-b')).toEqual([])
  })
})
