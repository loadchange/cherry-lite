import { createContext, use } from 'react'

import { useTopics } from './useTopic'

/**
 * Window-level data sources shared by every kept-alive chat route.
 *
 * The raw hooks are mounted once by ResourceViewSourceProvider. Route pages read
 * the provider's progressive cold-start data, then its last complete snapshot
 * during background refreshes. This keeps first-page content responsive without
 * letting multiple kept-alive tabs start competing load-all chains.
 */

export function useRawAssistantTopicsSource({ enabled }: { enabled?: boolean } = {}) {
  return useTopics({ loadAll: true, enabled })
}

type RawAssistantTopicsSource = ReturnType<typeof useRawAssistantTopicsSource>

/**
 * A background refresh that failed while a committed snapshot is still on
 * screen. It is deliberately separate from `error`: the snapshot stays served
 * (blowing a good list away into an error panel is worse), but the failure must
 * not be silent — nothing retries on its own, so the list would otherwise stay
 * stale for the window's lifetime with no visible cause.
 */
type RefreshError = { refreshError: RawAssistantTopicsSource['error'] }

export type AssistantTopicsSource = Pick<
  RawAssistantTopicsSource,
  'topics' | 'isLoadingAll' | 'isFullyLoaded' | 'isRefreshing' | 'error' | 'refetch'
> &
  RefreshError

export const AssistantTopicsSourceContext = createContext<AssistantTopicsSource | null>(null)

export function useAssistantTopicsSource(): AssistantTopicsSource {
  const source = use(AssistantTopicsSourceContext)
  if (!source) {
    throw new Error('useAssistantTopicsSource must be used within ResourceViewSourceProvider')
  }
  return source
}
