import { DataApiErrorFactory } from '@shared/data/api/errors'
import {
  CONTENT_SEARCH_DEFAULT_LIMIT_PER_SOURCE,
  CONTENT_SEARCH_MAX_LIMIT_PER_SOURCE,
  ContentSearchQuerySchema,
  contentSearchSourceTypes,
  type TopicMessageContentSearchItem
} from '@shared/data/api/schemas/search'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { topicSearchMock } = vi.hoisted(() => ({
  topicSearchMock: vi.fn()
}))

vi.mock('@data/services/MessageService', () => ({
  messageService: {
    search: topicSearchMock
  }
}))

import { CONTENT_SEARCH_SOURCE_ADAPTERS, ContentSearchService } from '../ContentSearchService'

const topicItem: TopicMessageContentSearchItem = {
  messageId: 'topic-message-1',
  topicId: 'topic-1',
  topicName: 'Topic One',
  role: 'assistant',
  topicCreatedAt: '2026-05-01T00:00:00.000Z',
  topicUpdatedAt: '2026-05-02T00:00:00.000Z',
  snippet: 'needle topic',
  createdAt: '2026-05-03T00:00:00.000Z'
}

describe('ContentSearchService', () => {
  let service: ContentSearchService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ContentSearchService()
  })

  it('keeps the adapter registry exhaustive for every content source type', () => {
    expect(Object.keys(CONTENT_SEARCH_SOURCE_ADAPTERS)).toEqual([...contentSearchSourceTypes])
  })

  it('runs every source by default and returns grouped cursors', async () => {
    topicSearchMock.mockReturnValueOnce({ items: [topicItem], nextCursor: '200:topic-message-1' })

    const result = service.search(
      ContentSearchQuerySchema.parse({
        q: '  needle  ',
        limitPerSource: 2,
        createdAtFrom: '2026-05-01T00:00:00.000Z'
      })
    )

    expect(topicSearchMock).toHaveBeenCalledWith({
      q: 'needle',
      cursor: undefined,
      limit: 2,
      createdAtFrom: '2026-05-01T00:00:00.000Z'
    })
    expect(result).toEqual({
      query: 'needle',
      groups: [{ sourceType: 'topic-message', items: [topicItem], nextCursor: '200:topic-message-1' }]
    })
  })

  it('runs the explicitly requested source with its cursor and filter for load more', async () => {
    topicSearchMock.mockReturnValueOnce({ items: [topicItem], nextCursor: undefined })

    const result = service.search(
      ContentSearchQuerySchema.parse({
        q: 'needle',
        sources: ['topic-message'],
        cursors: { 'topic-message': '200:topic-message-1' },
        filters: { 'topic-message': { topicId: 'topic-1' } },
        limitPerSource: 1
      })
    )

    expect(topicSearchMock).toHaveBeenCalledWith({
      q: 'needle',
      topicId: 'topic-1',
      cursor: '200:topic-message-1',
      limit: 1,
      createdAtFrom: undefined
    })
    expect(result.groups).toEqual([{ sourceType: 'topic-message', items: [topicItem], nextCursor: undefined }])
  })

  it('passes the matching source filter to the adapter', async () => {
    topicSearchMock.mockReturnValueOnce({ items: [topicItem], nextCursor: undefined })

    service.search(
      ContentSearchQuerySchema.parse({
        q: 'needle',
        filters: {
          'topic-message': { topicId: 'topic-1' }
        }
      })
    )

    expect(topicSearchMock).toHaveBeenCalledWith({
      q: 'needle',
      topicId: 'topic-1',
      cursor: undefined,
      limit: CONTENT_SEARCH_DEFAULT_LIMIT_PER_SOURCE,
      createdAtFrom: undefined
    })
  })

  it('passes the matching per-source cursor to the adapter', async () => {
    topicSearchMock.mockReturnValueOnce({ items: [topicItem], nextCursor: undefined })

    service.search(
      ContentSearchQuerySchema.parse({
        q: 'needle',
        cursors: { 'topic-message': '200:topic-message-1' }
      })
    )

    expect(topicSearchMock).toHaveBeenCalledWith({
      q: 'needle',
      cursor: '200:topic-message-1',
      limit: CONTENT_SEARCH_DEFAULT_LIMIT_PER_SOURCE,
      createdAtFrom: undefined
    })
  })

  it('clamps direct service limitPerSource above the maximum', async () => {
    topicSearchMock.mockReturnValueOnce({ items: [topicItem], nextCursor: undefined })

    service.search({
      q: 'needle',
      sources: ['topic-message'],
      limitPerSource: CONTENT_SEARCH_MAX_LIMIT_PER_SOURCE + 1
    })

    expect(topicSearchMock).toHaveBeenCalledWith({
      q: 'needle',
      cursor: undefined,
      limit: CONTENT_SEARCH_MAX_LIMIT_PER_SOURCE,
      createdAtFrom: undefined
    })
  })

  it('reports malformed cursors on the source-specific cursor field', async () => {
    topicSearchMock.mockImplementationOnce(() => {
      throw DataApiErrorFactory.validation({ cursor: ['must be a valid message cursor'] }, 'Invalid message cursor')
    })

    let err: unknown
    try {
      service.search(
        ContentSearchQuerySchema.parse({
          q: 'needle',
          sources: ['topic-message'],
          cursors: { 'topic-message': 'not-a-cursor' }
        })
      )
    } catch (e) {
      err = e
    }
    expect(err).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Invalid message cursor',
      details: {
        fieldErrors: {
          'cursors.topic-message': ['must be a valid message cursor']
        }
      }
    })
  })

  it('fails the full query with source context when a source has a non-cursor error', async () => {
    topicSearchMock.mockImplementationOnce(() => {
      throw new Error('database is busy')
    })

    let err: unknown
    try {
      service.search(
        ContentSearchQuerySchema.parse({
          q: 'needle'
        })
      )
    } catch (e) {
      err = e
    }
    expect(err).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: expect.stringContaining('content search source topic-message')
    })
  })
})
