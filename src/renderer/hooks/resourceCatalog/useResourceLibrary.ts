import { useGroups } from '@renderer/hooks/useGroups'
import type { ResourceItem, ResourceType, SortKey } from '@renderer/types/resourceCatalog'
import type { Assistant } from '@shared/data/types/assistant'
import type { Prompt } from '@shared/data/types/prompt'
import { useCallback, useMemo } from 'react'

import { assistantAdapter } from './assistantAdapter'
import { promptAdapter } from './promptAdapter'

function compareItems(a: ResourceItem, b: ResourceItem, sort: SortKey): number {
  if (sort === 'name') return a.name.localeCompare(b.name, 'zh')
  const aKey = sort === 'createdAt' ? a.createdAt : a.updatedAt
  const bKey = sort === 'createdAt' ? b.createdAt : b.updatedAt
  return bKey.localeCompare(aKey)
}

export interface UseResourceLibraryOptions {
  resourceType: ResourceType
  activeGroupId: string | null
  search: string
  sort: SortKey
}

export interface UseResourceLibraryResult {
  resources: ResourceItem[]
  allResources: ResourceItem[]
  isLoading: boolean
  isRefreshing: boolean
  error?: Error
  refetch: () => void
}

export function useResourceLibrary({
  resourceType,
  activeGroupId,
  search,
  sort
}: UseResourceLibraryOptions): UseResourceLibraryResult {
  const assistantGroups = useGroups('assistant')

  const trimmedSearch = search.trim() || undefined
  const isAssistant = resourceType === 'assistant'
  const isPrompt = resourceType === 'prompt'

  // Assistant needs two reads:
  // - Base (no params): powers assistant group chips so they don't collapse when
  //   the user types in the search box.
  // - Filtered: powers the visible grid. When `trimmedSearch`/`groupId` are
  //   undefined the SWR key matches the base read and the call is deduped, so
  //   there's no extra network hit until the user actually filters.
  const baseAssistants = assistantAdapter.useList({ enabled: isAssistant })

  const groupById = useMemo(
    () => new Map(assistantGroups.groups.map((group) => [group.id, group] as const)),
    [assistantGroups.groups]
  )

  const filteredAssistants = assistantAdapter.useList({
    enabled: isAssistant,
    search: isAssistant ? trimmedSearch : undefined,
    groupId: isAssistant ? (activeGroupId ?? undefined) : undefined
  })
  const prompts = promptAdapter.useList({ enabled: isPrompt, search: isPrompt ? trimmedSearch : undefined })

  const buildAssistantItem = useCallback(
    (a: Assistant): ResourceItem => {
      const group = a.groupId ? groupById.get(a.groupId) : undefined
      return {
        id: a.id,
        type: 'assistant',
        name: a.name,
        description: a.description || '',
        avatar: a.emoji || '💬',
        // Embedded by AssistantService.list through ModelService; null when the
        // bound model row was removed.
        model: a.modelName ?? undefined,
        groupId: a.groupId ?? undefined,
        groupName: group?.name,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        raw: a
      }
    },
    [groupById]
  )

  const buildPromptItem = useCallback((p: Prompt): ResourceItem => {
    return {
      id: p.id,
      type: 'prompt',
      name: p.title,
      description: p.content.replace(/\s+/g, ' ').trim(),
      avatar: 'Aa',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      raw: p
    }
  }, [])

  const allResources = useMemo<ResourceItem[]>(() => {
    if (isAssistant) return baseAssistants.data.map(buildAssistantItem)
    return prompts.data.map(buildPromptItem)
  }, [isAssistant, baseAssistants.data, prompts.data, buildAssistantItem, buildPromptItem])

  const filteredAssistantItems = useMemo(
    () => filteredAssistants.data.map(buildAssistantItem),
    [filteredAssistants.data, buildAssistantItem]
  )
  const promptItems = useMemo(() => prompts.data.map(buildPromptItem), [prompts.data, buildPromptItem])

  const resources = useMemo<ResourceItem[]>(() => {
    const list = isAssistant ? filteredAssistantItems : promptItems

    return [...list].sort((a, b) => compareItems(a, b, sort))
  }, [isAssistant, filteredAssistantItems, promptItems, sort])

  const isLoading = isAssistant
    ? baseAssistants.isLoading || filteredAssistants.isLoading || assistantGroups.isLoading
    : prompts.isLoading
  const isRefreshing = isAssistant
    ? baseAssistants.isRefreshing || filteredAssistants.isRefreshing
    : prompts.isRefreshing
  const error = isAssistant
    ? (baseAssistants.error ?? filteredAssistants.error ?? assistantGroups.error)
    : prompts.error

  const baseAssistantsRefetch = baseAssistants.refetch
  const filteredAssistantsRefetch = filteredAssistants.refetch
  const promptsRefetch = prompts.refetch
  const groupsRefetch = assistantGroups.refetch

  const refetch = useCallback(() => {
    if (isAssistant) {
      baseAssistantsRefetch()
      filteredAssistantsRefetch()
      void groupsRefetch()
    } else {
      promptsRefetch()
    }
  }, [isAssistant, baseAssistantsRefetch, filteredAssistantsRefetch, promptsRefetch, groupsRefetch])

  return {
    resources,
    allResources,
    isLoading,
    isRefreshing,
    error,
    refetch
  }
}
