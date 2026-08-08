// @vitest-environment jsdom
import type { TabsContextValue } from '@renderer/hooks/tab'
import { TabsContext } from '@renderer/hooks/tab/useTabsContext'
import type { Tab } from '@shared/data/cache/cacheValueTypes'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCloseConversationTabs } from '../useCloseConversationTabs'

function createTabsContext(tabs: Tab[], closeTabs = vi.fn(), activeTabId = tabs[0]?.id ?? ''): TabsContextValue {
  const activeTab = tabs.find((tab) => tab.id === activeTabId)

  return {
    tabs,
    activeTabId,
    activeTab,
    isLoading: false,
    addTab: vi.fn(),
    closeTab: vi.fn(),
    closeTabs,
    setActiveTab: vi.fn(),
    updateTab: vi.fn(),
    openTab: vi.fn(),
    pinTab: vi.fn(),
    unpinTab: vi.fn(),
    reorderTabs: vi.fn(),
    detachTab: vi.fn(),
    attachTab: vi.fn()
  }
}

function wrapperFor(value: TabsContextValue) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <TabsContext value={value}>{children}</TabsContext>
  }
}

describe('useCloseConversationTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('closes assistant tabs matching deleted topic ids', () => {
    const closeTabs = vi.fn()
    const context = createTabsContext(
      [
        {
          id: 'topic-a-tab',
          type: 'route',
          url: '/app/chat?topicId=topic-a',
          title: 'Topic A'
        },
        {
          id: 'topic-b-url-tab',
          type: 'route',
          url: '/app/chat?topicId=topic-b',
          title: 'Topic B'
        },
        {
          id: 'message-only-tab',
          type: 'route',
          url: '/app/chat?view=message&topicId=topic-a',
          title: 'Message'
        },
        {
          id: 'translate-tab',
          type: 'route',
          url: '/app/translate',
          title: 'Translate'
        }
      ],
      closeTabs,
      'translate-tab'
    )

    const { result } = renderHook(() => useCloseConversationTabs(), { wrapper: wrapperFor(context) })

    act(() => {
      result.current('assistants', ['topic-a', 'topic-b'])
    })

    expect(closeTabs).toHaveBeenCalledWith(['topic-a-tab', 'topic-b-url-tab'])
  })

  it('keeps the active matching conversation tab open', () => {
    const activeTab: Tab = {
      id: 'active-topic-a-tab',
      type: 'route',
      url: '/app/chat?topicId=topic-a',
      title: 'Active'
    }
    const backgroundTab: Tab = {
      id: 'background-topic-a-tab',
      type: 'route',
      url: '/app/chat?topicId=topic-a',
      title: 'Background'
    }
    const closeTabs = vi.fn()
    const context = createTabsContext([activeTab, backgroundTab], closeTabs, activeTab.id)

    const { result } = renderHook(() => useCloseConversationTabs(), { wrapper: wrapperFor(context) })

    act(() => {
      result.current('assistants', ['topic-a'])
    })

    expect(closeTabs).toHaveBeenCalledWith([backgroundTab.id])
  })

  it('delegates an empty close list when only the active tab matches', () => {
    const closeTabs = vi.fn()
    const context = createTabsContext(
      [
        {
          id: 'active-topic-tab',
          type: 'route',
          url: '/app/chat?topicId=topic-a',
          title: 'Active Topic'
        }
      ],
      closeTabs,
      'active-topic-tab'
    )

    const { result } = renderHook(() => useCloseConversationTabs(), { wrapper: wrapperFor(context) })

    act(() => {
      result.current('assistants', ['topic-a'])
    })

    expect(closeTabs).toHaveBeenCalledWith([])
  })
})
