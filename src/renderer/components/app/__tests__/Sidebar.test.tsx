// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import type { SidebarAppId } from '@renderer/utils/sidebar'
import type { SidebarFavoriteItem } from '@shared/data/preference/preferenceTypes'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as SidebarConstants from '../../Sidebar/constants'

type FakeTab = {
  id: string
  type: 'route'
  url: string
  title: string
  icon?: string
  isPinned?: boolean
  metadata?: Record<string, unknown>
}

const mocks = vi.hoisted(() => ({
  emitResourceListReveal: vi.fn(),
  openTab: vi.fn(),
  openSettingsTab: vi.fn(),
  setActiveTab: vi.fn(),
  updateTab: vi.fn(),
  activeTab: {
    id: 'chat',
    type: 'route',
    url: '/app/chat',
    title: 'Chat'
  } as FakeTab | null,
  setSidebarWidth: vi.fn(),
  setSidebarFavorites: vi.fn(() => Promise.resolve()),
  showUserPopup: vi.fn(),
  sidebarWidth: 50,
  tabs: [] as FakeTab[],
  sidebarFavorites: [{ type: 'app', id: 'assistants' }] as SidebarFavoriteItem[],
  onEntriesReorder: undefined as ((event: { oldIndex: number; newIndex: number }) => void) | undefined
}))

vi.mock('@data/hooks/useCache', () => ({
  usePersistCache: () => {
    return [
      mocks.sidebarWidth,
      (width: number) => {
        mocks.sidebarWidth = width
        mocks.setSidebarWidth(width)
      }
    ]
  }
}))

vi.mock('@data/hooks/usePreference', () => ({
  usePreference: (key: string) => {
    if (key === 'app.user.name') return ['JD']
    if (key === 'ui.sidebar.favorites') return [mocks.sidebarFavorites, mocks.setSidebarFavorites]
    return [undefined]
  }
}))

vi.mock('@renderer/hooks/useAvatar', () => ({
  default: () => undefined
}))

vi.mock('@renderer/i18n/label', () => ({
  getSidebarIconLabelKey: (icon: string) =>
    ({
      assistants: 'Chat',
      translate: 'Translate'
    })[icon] ?? icon
}))

vi.mock('@renderer/utils/routeTitle', () => ({
  getDefaultRouteTitle: (url: string) =>
    ({
      '/app/chat': 'Chat',
      '/app/translate': 'Translate'
    })[url] ?? 'Chat'
}))

vi.mock('@renderer/services/resourceListRevealEvents', () => ({
  emitResourceListReveal: mocks.emitResourceListReveal
}))

vi.mock('@renderer/hooks/tab', () => ({
  useTabs: () => ({
    activeTab: mocks.activeTab,
    tabs: mocks.tabs,
    openTab: mocks.openTab,
    updateTab: mocks.updateTab,
    setActiveTab: mocks.setActiveTab
  }),
  useOptionalTabsContext: () => ({
    tabs: mocks.tabs,
    openTab: mocks.openTab,
    setActiveTab: mocks.setActiveTab
  })
}))

vi.mock('@renderer/services/mainWindowNavigation', () => ({
  openSettingsTab: mocks.openSettingsTab
}))

vi.mock('../../UserPopup', () => ({
  default: {
    show: mocks.showUserPopup
  }
}))

vi.mock('../../layout/ShellTabBarActions', () => ({
  SidebarShellActions: ({ layout, onSettingsClick }: { layout: string; onSettingsClick: () => void }) => (
    <button type="button" data-testid={`sidebar-shell-actions-${layout}`} onClick={onSettingsClick} />
  )
}))

type MockSidebarEntry = {
  key: string
  label: string
  isActive: (active: { activeItem: string }) => boolean
  onOpen: () => void
  contextMenuItems?: Array<{ id: string; label: string; enabled?: boolean; onSelect?: () => void }>
}

const parseEntryKey = (key: string) => {
  const idx = key.indexOf(':')
  return { type: key.slice(0, idx), id: key.slice(idx + 1) }
}

vi.mock('../../Sidebar', async () => {
  const constants = await vi.importActual<typeof SidebarConstants>('../../Sidebar/constants')
  return {
    ...constants,
    UserAvatar: ({ user, className }: { user: { name: string }; className?: string }) => (
      <div className={className} data-testid="sidebar-user-avatar">
        {user.name}
      </div>
    ),
    Sidebar: ({
      isFloating,
      isFloatingClosing,
      onDismiss,
      onHoverChange,
      onEntriesReorder,
      entries,
      title,
      logo,
      user,
      actions,
      width,
      onResizePreview
    }: {
      isFloating?: boolean
      isFloatingClosing?: boolean
      active?: { activeItem: string }
      entries?: MockSidebarEntry[]
      title?: string
      logo?: ReactNode
      user?: unknown
      actions?: ReactNode | ((layout: 'icon' | 'full') => ReactNode)
      width?: number
      onResizePreview?: (width: number | null) => void
      onDismiss?: () => void
      onHoverChange?: (hovering: boolean) => void
      onEntriesReorder?: (event: { oldIndex: number; newIndex: number }) => void
    }) => {
      mocks.onEntriesReorder = onEntriesReorder
      // Entries are type-agnostic resolved rows; the tests still assert per-type
      // testids, so recover the type/id from the stable `entry.key` (`${type}:${id}`).
      const items = entries?.filter((entry) => parseEntryKey(entry.key).type === 'app')
      return isFloating ? (
        <div
          className={isFloatingClosing ? 'slide-out-to-left-2 animate-out' : 'slide-in-from-left-2 animate-in'}
          data-testid="floating-sidebar">
          <button type="button" onClick={onDismiss}>
            dismiss
          </button>
        </div>
      ) : (
        <>
          <div data-testid="sidebar-title">{title}</div>
          <div data-testid="sidebar-logo">{logo}</div>
          <div data-testid="sidebar-footer-user">{user ? 'user' : 'none'}</div>
          <div data-testid="sidebar-footer-actions">{typeof actions === 'function' ? actions('icon') : actions}</div>
          <button type="button" data-testid="preview-80" onClick={() => onResizePreview?.(80)} />
          <button type="button" data-testid="preview-null" onClick={() => onResizePreview?.(null)} />
          <button type="button" onClick={() => onHoverChange?.(true)}>
            reveal
          </button>
          <div data-testid="ui-sidebar" data-width={width} />
          <div data-testid="sidebar-items">
            {items?.map((item) => (
              <div key={item.key}>
                <button
                  type="button"
                  data-testid={`sidebar-item-${parseEntryKey(item.key).id}`}
                  onClick={() => item.onOpen()}>
                  <span>{item.label}</span>
                </button>
                {item.contextMenuItems?.map((menuItem) => (
                  <button
                    key={menuItem.id}
                    type="button"
                    data-testid={`sidebar-menu-${menuItem.id}`}
                    disabled={menuItem.enabled === false}
                    onClick={menuItem.onSelect}>
                    {menuItem.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )
    }
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      if (key === 'common.search') return 'Search'
      return options?.defaultValue ?? key
    }
  })
}))

import Sidebar from '../Sidebar'

const appFavorite = (id: SidebarAppId): SidebarFavoriteItem => ({ type: 'app', id })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.sidebarFavorites = [appFavorite('assistants')]
  mocks.setSidebarFavorites.mockReset()
  mocks.setSidebarFavorites.mockResolvedValue(undefined)
  mocks.activeTab = {
    id: 'chat',
    type: 'route',
    url: '/app/chat',
    title: 'Chat'
  }
  mocks.tabs = []
  mocks.sidebarWidth = 50
  vi.useRealTimers()
  document.documentElement.style.removeProperty('--sidebar-width')
})

describe('app Sidebar', () => {
  it('uses the user avatar as the header logo and moves footer actions out of the tab bar', () => {
    const { container } = render(<Sidebar />)

    expect(container.querySelector('#app-sidebar')).toHaveAttribute('data-ui', 'app.sidebar')
    expect(screen.getByTestId('sidebar-logo')).toContainElement(screen.getByTestId('sidebar-user-avatar'))
    expect(screen.getByTestId('sidebar-title')).toHaveTextContent('JD')
    expect(screen.getByTestId('sidebar-footer-user')).toHaveTextContent('none')
    expect(screen.getByTestId('sidebar-shell-actions-icon')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'JD' }))

    expect(mocks.showUserPopup).toHaveBeenCalledTimes(1)
  })

  it('opens settings in a main-window tab from the sidebar footer action', () => {
    render(<Sidebar />)

    fireEvent.click(screen.getByTestId('sidebar-shell-actions-icon'))

    expect(mocks.openSettingsTab).toHaveBeenCalledWith('/settings/provider')
  })

  it('renders sidebar menu items in visible preference order', () => {
    mocks.sidebarFavorites = [appFavorite('translate'), appFavorite('assistants')]

    render(<Sidebar />)

    const labels = Array.from(screen.getByTestId('sidebar-items').querySelectorAll('span')).map(
      (element) => element.textContent
    )
    expect(labels).toEqual(['Translate', 'Chat'])
  })

  it('removes a sidebar app favorite from the context menu', () => {
    mocks.sidebarFavorites = [appFavorite('assistants'), appFavorite('translate')]

    render(<Sidebar />)

    expect(screen.getByTestId('sidebar-menu-sidebar.remove-app.translate')).toHaveTextContent(
      'launchpad.unpin_from_sidebar'
    )

    fireEvent.click(screen.getByTestId('sidebar-menu-sidebar.remove-app.translate'))

    expect(mocks.setSidebarFavorites).toHaveBeenCalledWith([appFavorite('assistants')])
  })

  it('keeps required sidebar favorites protected in the context menu', () => {
    render(<Sidebar />)

    expect(screen.getByTestId('sidebar-menu-sidebar.remove-app.assistants')).toBeDisabled()

    fireEvent.click(screen.getByTestId('sidebar-menu-sidebar.remove-app.assistants'))

    expect(mocks.setSidebarFavorites).not.toHaveBeenCalled()
  })

  it('reorders sidebar favorites through a single drag', () => {
    mocks.sidebarFavorites = [appFavorite('assistants'), appFavorite('translate')]

    render(<Sidebar />)
    // List is [assistants, translate]; drag translate to front.
    act(() => mocks.onEntriesReorder?.({ oldIndex: 1, newIndex: 0 }))

    expect(mocks.setSidebarFavorites).toHaveBeenCalledWith([appFavorite('translate'), appFavorite('assistants')])
  })

  it('does nothing when the active tab is already on the target route', () => {
    mocks.sidebarFavorites = [appFavorite('translate')]
    mocks.activeTab = {
      id: 'translate',
      type: 'route',
      url: '/app/translate',
      title: 'Translate'
    }

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-translate'))

    expect(mocks.updateTab).not.toHaveBeenCalled()
    expect(mocks.openTab).not.toHaveBeenCalled()
    expect(mocks.emitResourceListReveal).not.toHaveBeenCalled()
  })

  it('reuses the active tab without revealing its resource list', () => {
    mocks.activeTab = {
      id: 'translate',
      type: 'route',
      url: '/app/translate',
      title: 'Translate'
    }
    mocks.tabs = [{ id: 'chat-1', type: 'route', url: '/app/chat?topicId=t-1', title: 'Topic 1' }]

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-assistants'))

    expect(mocks.updateTab).toHaveBeenCalledWith('translate', {
      url: '/app/chat',
      title: 'Chat',
      icon: undefined,
      metadata: undefined
    })
    expect(mocks.emitResourceListReveal).not.toHaveBeenCalled()
    expect(mocks.setActiveTab).not.toHaveBeenCalled()
    expect(mocks.openTab).not.toHaveBeenCalled()
  })

  it('replaces the active tab with the bare route', () => {
    mocks.activeTab = {
      id: 'translate',
      type: 'route',
      url: '/app/translate',
      title: 'Translate',
      metadata: { keep: true }
    }

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-assistants'))

    // Which conversation the tab lands on is the route interceptor's decision — the
    // sidebar only replaces the tab with the app's bare entry route.
    expect(mocks.updateTab).toHaveBeenCalledWith('translate', {
      url: '/app/chat',
      title: 'Chat',
      icon: undefined,
      metadata: undefined
    })
    expect(mocks.setActiveTab).not.toHaveBeenCalled()
    expect(mocks.openTab).not.toHaveBeenCalled()
  })

  it('stays put when the active tab already holds a conversation of the target app', () => {
    mocks.activeTab = {
      id: 'chat-1',
      type: 'route',
      url: '/app/chat?topicId=topic-1',
      title: 'Topic 1'
    }

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-assistants'))

    // Re-entering through the interceptor would rebind the tab to the last-used
    // conversation — an owned tab is already "there", whatever topic it shows.
    expect(mocks.updateTab).not.toHaveBeenCalled()
    expect(mocks.openTab).not.toHaveBeenCalled()
  })

  it('navigates a message-only viewer of the same app back to the app entry', () => {
    mocks.activeTab = {
      id: 'viewer',
      type: 'route',
      url: '/app/chat?topicId=topic-1&view=message',
      title: 'Topic 1'
    }

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-assistants'))

    expect(mocks.updateTab).toHaveBeenCalledWith('viewer', {
      url: '/app/chat',
      title: 'Chat',
      icon: undefined,
      metadata: undefined
    })
  })

  it('clears route-specific metadata when reusing the active tab', () => {
    mocks.sidebarFavorites = [appFavorite('translate')]
    mocks.activeTab = {
      id: 'chat',
      type: 'route',
      url: '/app/chat?topicId=t-1',
      title: 'Topic',
      icon: 'emoji:🍒',
      metadata: { keep: true }
    }

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-translate'))

    expect(mocks.updateTab).toHaveBeenCalledWith('chat', {
      url: '/app/translate',
      title: 'Translate',
      icon: undefined,
      metadata: undefined
    })
    expect(mocks.openTab).not.toHaveBeenCalled()
    expect(mocks.emitResourceListReveal).not.toHaveBeenCalled()
  })

  it('reuses the active tab for single-policy routes too', () => {
    mocks.sidebarFavorites = [appFavorite('translate')]
    mocks.activeTab = {
      id: 'chat',
      type: 'route',
      url: '/app/chat',
      title: 'Chat'
    }

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-translate'))

    expect(mocks.updateTab).toHaveBeenCalledWith('chat', {
      url: '/app/translate',
      title: 'Translate',
      icon: undefined,
      metadata: undefined
    })
    expect(mocks.openTab).not.toHaveBeenCalled()
  })

  it('opens a forced tab without revealing its resource list when the active tab is pinned', () => {
    mocks.sidebarFavorites = [appFavorite('translate')]
    mocks.activeTab = {
      id: 'chat',
      type: 'route',
      url: '/app/chat',
      title: 'Chat',
      isPinned: true
    }
    mocks.openTab.mockReturnValue('translate-new')

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-translate'))

    expect(mocks.openTab).toHaveBeenCalledWith('/app/translate', {
      forceNew: true,
      title: 'Translate'
    })
    expect(mocks.emitResourceListReveal).not.toHaveBeenCalled()
    expect(mocks.updateTab).not.toHaveBeenCalled()
    expect(mocks.setActiveTab).not.toHaveBeenCalled()
  })

  it('opens a forced tab when there is no active tab', () => {
    mocks.sidebarFavorites = [appFavorite('translate')]
    mocks.activeTab = null
    mocks.openTab.mockReturnValue('translate-new')

    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-translate'))

    expect(mocks.openTab).toHaveBeenCalledWith('/app/translate', { forceNew: true, title: 'Translate' })
    expect(mocks.updateTab).not.toHaveBeenCalled()
    expect(mocks.setActiveTab).not.toHaveBeenCalled()
    expect(mocks.emitResourceListReveal).not.toHaveBeenCalled()
  })

  it('migrates a persisted intermediate sidebar width to icon width and converges', () => {
    mocks.sidebarWidth = 80

    const { rerender } = render(<Sidebar />)

    expect(mocks.sidebarWidth).toBe(50)
    expect(mocks.setSidebarWidth).toHaveBeenCalledTimes(1)

    rerender(<Sidebar />)

    expect(mocks.sidebarWidth).toBe(50)
    expect(mocks.setSidebarWidth).toHaveBeenCalledTimes(1)
  })

  it('uses the resize preview width for rendering and CSS variable without persisting it', () => {
    render(<Sidebar />)

    expect(screen.getByTestId('ui-sidebar')).toHaveAttribute('data-width', '50')
    expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('50px')

    fireEvent.click(screen.getByTestId('preview-80'))

    expect(screen.getByTestId('ui-sidebar')).toHaveAttribute('data-width', '80')
    expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('80px')
    expect(mocks.sidebarWidth).toBe(50)
    expect(mocks.setSidebarWidth).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('preview-null'))

    expect(screen.getByTestId('ui-sidebar')).toHaveAttribute('data-width', '50')
    expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('50px')
  })
})
