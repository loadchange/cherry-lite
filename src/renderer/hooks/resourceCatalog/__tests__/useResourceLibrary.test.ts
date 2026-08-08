import type { ResourceListQuery } from '@renderer/hooks/resourceCatalog'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useResourceLibrary } from '../useResourceLibrary'

const mocks = vi.hoisted(() => ({
  useAssistantList: vi.fn(),
  usePromptList: vi.fn(),
  useGroups: vi.fn()
}))

vi.mock('@renderer/hooks/resourceCatalog/assistantAdapter', () => ({
  assistantAdapter: {
    useList: mocks.useAssistantList
  }
}))

vi.mock('@renderer/hooks/resourceCatalog/promptAdapter', () => ({
  promptAdapter: {
    useList: mocks.usePromptList
  }
}))

vi.mock('@renderer/hooks/useGroups', () => ({
  useGroups: mocks.useGroups
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

function listResult(data: unknown[]) {
  return {
    data,
    isLoading: false,
    isRefreshing: false,
    error: undefined,
    refetch: vi.fn()
  }
}

function renderResourceLibrary(options: Partial<Parameters<typeof useResourceLibrary>[0]> = {}) {
  return renderHook(() =>
    useResourceLibrary({
      resourceType: 'assistant',
      activeGroupId: null,
      search: '',
      sort: 'updatedAt',
      ...options
    })
  )
}

const assistantListItem = {
  id: 'assistant-1',
  name: 'Assistant',
  description: '',
  emoji: '💬',
  modelName: null,
  groupId: null,
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z'
}

describe('useResourceLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAssistantList.mockReturnValue(listResult([]))
    mocks.usePromptList.mockReturnValue(listResult([]))
    mocks.useGroups.mockReturnValue({
      groups: [],
      isLoading: false,
      error: undefined,
      refetch: vi.fn()
    })
  })

  it('uses backend-resolved model names for assistant resource cards', () => {
    mocks.useAssistantList.mockReturnValue(listResult([{ ...assistantListItem, modelName: 'GPT-4o' }]))

    const { result } = renderResourceLibrary()

    expect(result.current.allResources).toMatchObject([{ id: 'assistant-1', type: 'assistant', model: 'GPT-4o' }])
    expect(mocks.useAssistantList.mock.calls[0]).toEqual([{ enabled: true }])
    expect(mocks.usePromptList).toHaveBeenCalledWith({ enabled: false, search: undefined })
  })

  it('maps assistant group ids to group names', () => {
    mocks.useGroups.mockReturnValue({
      groups: [
        {
          id: 'group-work',
          entityType: 'assistant',
          name: 'Work',
          orderKey: 'a0',
          createdAt: '2026-04-27T00:00:00.000Z',
          updatedAt: '2026-04-27T00:00:00.000Z'
        }
      ],
      isLoading: false,
      error: undefined,
      refetch: vi.fn()
    })
    mocks.useAssistantList.mockReturnValue(listResult([{ ...assistantListItem, groupId: 'group-work' }]))

    const { result } = renderResourceLibrary()

    expect(result.current.allResources).toMatchObject([{ id: 'assistant-1', groupId: 'group-work', groupName: 'Work' }])
  })

  it('omits the assistant card model when the backend cannot resolve a modelName', () => {
    mocks.useAssistantList.mockReturnValue(listResult([assistantListItem]))

    const { result } = renderResourceLibrary()

    expect(result.current.allResources[0]?.model).toBeUndefined()
  })

  it('maps prompt resources and forwards search without tag filters', () => {
    mocks.usePromptList.mockReturnValue(
      listResult([
        {
          id: 'prompt-filtered',
          title: '日报模板',
          content: '今日完成 ${task}',
          orderKey: 'b',
          createdAt: '2026-04-27T00:00:00.000Z',
          updatedAt: '2026-04-27T00:00:00.000Z'
        }
      ])
    )

    const { result } = renderResourceLibrary({
      resourceType: 'prompt',
      activeGroupId: '11111111-1111-4111-8111-111111111111',
      search: ' 日报 '
    })

    expect(mocks.usePromptList).toHaveBeenCalledWith({ enabled: true, search: '日报' })
    expect(result.current.resources).toMatchObject([
      {
        id: 'prompt-filtered',
        type: 'prompt',
        name: '日报模板',
        description: '今日完成 ${task}',
        avatar: 'Aa'
      }
    ])
  })

  it('forwards the selected assistant group id to filtered list reads', () => {
    const groupId = '11111111-1111-4111-8111-111111111111'
    mocks.useAssistantList.mockImplementation((query?: ResourceListQuery) => {
      if (query?.groupId) return listResult([])
      return listResult([{ ...assistantListItem, modelName: 'GPT-4o', groupId }])
    })

    renderResourceLibrary({ activeGroupId: groupId })

    expect(mocks.useAssistantList.mock.calls[1]).toEqual([{ enabled: true, search: undefined, groupId }])
  })

  it('ignores activeGroupId for non-assistant resources', () => {
    renderResourceLibrary({ resourceType: 'prompt', activeGroupId: '11111111-1111-4111-8111-111111111111' })

    expect(mocks.usePromptList).toHaveBeenCalledWith({ enabled: true, search: undefined })
    expect(mocks.useAssistantList.mock.calls[0]).toEqual([{ enabled: false }])
    expect(mocks.useAssistantList.mock.calls[1]).toEqual([{ enabled: false, search: undefined, groupId: undefined }])
  })
})
