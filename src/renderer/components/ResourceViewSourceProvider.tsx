import {
  type AssistantTopicsSource,
  AssistantTopicsSourceContext,
  useRawAssistantTopicsSource
} from '@renderer/hooks/resourceViewSources'
import { useTabs } from '@renderer/hooks/tab'
import {
  getSidebarApp,
  isMessageOnlyConversationUrl,
  type SidebarAppId,
  tabBelongsToApp
} from '@renderer/utils/sidebar'
import type { Tab } from '@shared/data/cache/cacheValueTypes'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

type AssistantTopicsSnapshot = Pick<ReturnType<typeof useRawAssistantTopicsSource>, 'pages' | 'topics'>

export function shouldLoadResourceViewSource(
  tabs: readonly Tab[],
  activeTabId: string | null | undefined,
  appId: SidebarAppId
): boolean {
  const app = getSidebarApp(appId)
  if (!app) return false

  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  return Boolean(
    activeTab?.type === 'route' &&
      !activeTab.isDormant &&
      tabBelongsToApp(app, activeTab.url) &&
      !isMessageOnlyConversationUrl(activeTab.url)
  )
}

function useCommittedAssistantTopicsSource(enabled: boolean): AssistantTopicsSource {
  const rawSource = useRawAssistantTopicsSource({ enabled })
  const [snapshot, setSnapshot] = useState<AssistantTopicsSnapshot | null>(null)
  const rawSourceReady = enabled && rawSource.isFullyLoaded && !rawSource.isRefreshing && !rawSource.error

  useEffect(() => {
    if (!rawSourceReady) return

    setSnapshot((currentSnapshot) =>
      currentSnapshot?.pages === rawSource.pages && currentSnapshot?.topics === rawSource.topics
        ? currentSnapshot
        : {
            pages: rawSource.pages,
            topics: rawSource.topics
          }
    )
  }, [rawSource.pages, rawSource.topics, rawSourceReady])

  const isColdLoading = enabled && snapshot === null
  const snapshotIsCurrent = snapshot?.pages === rawSource.pages && snapshot?.topics === rawSource.topics
  // A failed background refresh keeps serving the stale snapshot (stale-while-
  // error). While a retry fetch is actually in flight `isRefreshing` stays
  // honest, but once the source is idle with an error, `!isFullyLoaded` alone
  // must not pin consumers in a perpetual refreshing state (e.g. reorder
  // disabled) with no visible cause.
  const isBackgroundRefreshing =
    enabled &&
    snapshot !== null &&
    (rawSource.isRefreshing ||
      (!rawSource.error && (!rawSource.isFullyLoaded || (rawSourceReady && !snapshotIsCurrent))))

  return useMemo(
    () => ({
      topics: snapshot?.topics ?? (enabled ? rawSource.topics : []),
      isLoadingAll: isColdLoading && rawSource.isLoadingAll,
      isFullyLoaded: snapshot !== null,
      isRefreshing: isBackgroundRefreshing,
      error: snapshot ? undefined : rawSource.error,
      refreshError: snapshot ? rawSource.error : undefined,
      refetch: rawSource.refetch
    }),
    [
      isBackgroundRefreshing,
      isColdLoading,
      rawSource.error,
      rawSource.isLoadingAll,
      rawSource.refetch,
      rawSource.topics,
      enabled,
      snapshot
    ]
  )
}

export function ResourceViewSourceProvider({ children }: { children: ReactNode }) {
  const { activeTabId, tabs } = useTabs()
  const assistantTopicsEnabled = useMemo(
    () => shouldLoadResourceViewSource(tabs, activeTabId, 'assistants'),
    [activeTabId, tabs]
  )
  const assistantTopicsSource = useCommittedAssistantTopicsSource(assistantTopicsEnabled)

  return <AssistantTopicsSourceContext value={assistantTopicsSource}>{children}</AssistantTopicsSourceContext>
}
