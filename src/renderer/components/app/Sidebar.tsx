import { usePersistCache } from '@data/hooks/useCache'
import { usePreference } from '@data/hooks/usePreference'
import { arrayMove } from '@dnd-kit/sortable'
import { useTabs } from '@renderer/hooks/tab'
import useAvatar from '@renderer/hooks/useAvatar'
import { useSidebarFavorites } from '@renderer/hooks/useSidebarFavorites'
import { openSettingsTab } from '@renderer/services/mainWindowNavigation'
import { getDefaultRouteTitle } from '@renderer/utils/routeTitle'
import type { SidebarAppId } from '@renderer/utils/sidebar'
import {
  getSidebarApp,
  getSidebarFavoriteKey,
  getSidebarMenuPath,
  isMessageOnlyConversationUrl,
  REQUIRED_SIDEBAR_FAVORITES,
  resolveSidebarActiveItem,
  tabBelongsToApp
} from '@renderer/utils/sidebar'
import type { Ref } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SidebarShellActions } from '../layout/ShellTabBarActions'
import {
  getSidebarDisplayWidth,
  getSidebarLayout,
  normalizeSidebarWidth,
  Sidebar as UISidebar,
  type SidebarUser,
  type SidebarVisibleLayout,
  UserAvatar
} from '../Sidebar'
import UserPopup from '../UserPopup'
import { resolveSidebarEntry, type SidebarVariantContext } from './sidebarVariants'

const REQUIRED_SIDEBAR_FAVORITE_SET = new Set<SidebarAppId>(REQUIRED_SIDEBAR_FAVORITES)

export default function Sidebar({ ref }: { ref?: Ref<HTMLDivElement | null> }) {
  const { t } = useTranslation()
  const [userName] = usePreference('app.user.name')
  const { favorites, setAppPinned, reorderFavorites } = useSidebarFavorites()
  const { activeTab, updateTab, openTab } = useTabs()

  // Sidebar width — persisted across restarts. Dragging through the
  // intermediate 50-120px range uses a local preview width so the UI can
  // follow the cursor without persisting unstable widths.
  const [sidebarWidth, setSidebarWidth] = usePersistCache('ui.sidebar.width')
  const [previewSidebarWidth, setPreviewSidebarWidth] = useState<number | null>(null)
  const activeSidebarWidth = previewSidebarWidth ?? sidebarWidth

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${getSidebarDisplayWidth(activeSidebarWidth)}px`)
  }, [activeSidebarWidth])

  // Migration, not dead code: the resize path only persists normalized widths,
  // but older builds (three-state layout, default 65) persisted intermediate
  // values that must be collapsed once on load. Writing derived state back
  // cannot loop — normalizeSidebarWidth is idempotent and the write is guarded
  // by the inequality check. Skip while a drag preview is active so the
  // write-back does not clobber it.
  useEffect(() => {
    if (previewSidebarWidth !== null) return

    const normalizedWidth = normalizeSidebarWidth(sidebarWidth)
    if (normalizedWidth !== sidebarWidth) {
      setSidebarWidth(normalizedWidth)
    }
  }, [previewSidebarWidth, setSidebarWidth, sidebarWidth])

  // User avatar
  const avatar = useAvatar()
  const sidebarUser = useMemo<SidebarUser>(
    () => ({
      name: userName || t('chat.user', { defaultValue: t('export.user', { defaultValue: 'User' }) }),
      avatar: avatar || undefined,
      onClick: () => UserPopup.show()
    }),
    [avatar, t, userName]
  )
  const sidebarLogo = useMemo(
    () => (
      <button
        type="button"
        aria-label={sidebarUser.name}
        onClick={sidebarUser.onClick}
        className="flex h-full w-full items-center justify-center rounded-full [-webkit-app-region:no-drag]">
        <UserAvatar user={sidebarUser} className="h-full w-full" ring={false} />
      </button>
    ),
    [sidebarUser]
  )

  // Floating sidebar (hover reveal when hidden)
  const [hoverVisible, setHoverVisible] = useState(false)
  const layout = getSidebarLayout(activeSidebarWidth)

  // Menu items
  const pathname = activeTab?.url || '/'
  const handleRemoveSidebarFavorite = useCallback(
    (favorite: SidebarAppId) => {
      if (REQUIRED_SIDEBAR_FAVORITE_SET.has(favorite)) return
      setAppPinned(favorite, false)
    },
    [setAppPinned]
  )

  const activeItem = resolveSidebarActiveItem(pathname)

  const handleNavigate = useCallback(
    (menuItemId: string) => {
      const menuId = menuItemId as SidebarAppId
      const app = getSidebarApp(menuId)
      const path = getSidebarMenuPath(menuId)
      if (!app || !path) return

      // Conversation apps: any owned tab is already "there" — its URL carries its own
      // conversation, and re-entering through the route interceptor would just rebind
      // it. Message-only viewers are not an app entry, so they navigate like any
      // foreign tab. Apps without sub-instances keep exact-URL matching.
      const isActiveTarget =
        !!activeTab &&
        (app.conversationRoute
          ? tabBelongsToApp(app, activeTab.url) && !isMessageOnlyConversationUrl(activeTab.url)
          : activeTab.url === path)
      if (isActiveTarget) return

      const title = getDefaultRouteTitle(path)

      if (activeTab?.isPinned) {
        openTab(path, { forceNew: true, title })
        return
      }

      if (activeTab) {
        updateTab(activeTab.id, {
          url: path,
          title,
          icon: undefined,
          metadata: undefined
        })
        return
      }

      openTab(path, { forceNew: true, title })
    },
    [activeTab, openTab, updateTab]
  )
  const handleOpenSettingsTab = useCallback(() => {
    openSettingsTab('/settings/provider')
  }, [])

  // All per-type sidebar knowledge (icon, label, route, active-match, open, remove)
  // lives in the variant registry; the container only supplies the runtime context.
  const variantContext = useMemo<SidebarVariantContext>(
    () => ({
      t,
      isRequiredApp: (id) => REQUIRED_SIDEBAR_FAVORITE_SET.has(id),
      openApp: handleNavigate,
      removeApp: handleRemoveSidebarFavorite
    }),
    [t, handleNavigate, handleRemoveSidebarFavorite]
  )

  // One continuous list in stored favorites order. Unrenderable rows (no
  // route/icon) are dropped here but stay in the preference.
  const entries = useMemo(
    () => favorites.flatMap((favorite) => resolveSidebarEntry(favorite, variantContext) ?? []),
    [favorites, variantContext]
  )

  // A single drag reorders the whole list. arrayMove yields the new entry
  // order; map each entry back to its favorite by key and persist. The sidebar owns
  // its order entirely through `ui.sidebar.favorites` and never touches order keys.
  const handleReorder = useCallback(
    ({ oldIndex, newIndex }: { oldIndex: number; newIndex: number }) => {
      const byKey = new Map(favorites.map((favorite) => [getSidebarFavoriteKey(favorite), favorite]))
      const nextFavorites = arrayMove(entries, oldIndex, newIndex).flatMap((entry) => {
        const favorite = byKey.get(entry.key)
        return favorite ? [favorite] : []
      })
      reorderFavorites(nextFavorites)
    },
    [entries, favorites, reorderFavorites]
  )

  // Common props shared between normal and floating sidebar
  const sidebarProps = {
    entries,
    active: { activeItem },
    title: sidebarUser.name,
    logo: sidebarLogo,
    actions: (footerLayout: SidebarVisibleLayout) => (
      <SidebarShellActions layout={footerLayout} onSettingsClick={handleOpenSettingsTab} />
    ),
    onEntriesReorder: handleReorder
  }

  return (
    <div ref={ref} id="app-sidebar" data-ui="app.sidebar" className="relative h-full [-webkit-app-region:no-drag]">
      <UISidebar
        width={activeSidebarWidth}
        setWidth={setSidebarWidth}
        onHoverChange={setHoverVisible}
        onResizePreview={setPreviewSidebarWidth}
        {...sidebarProps}
      />
      {hoverVisible && layout === 'hidden' && (
        <UISidebar
          width={activeSidebarWidth}
          setWidth={setSidebarWidth}
          isFloating
          onDismiss={() => setHoverVisible(false)}
          {...sidebarProps}
        />
      )}
    </div>
  )
}
