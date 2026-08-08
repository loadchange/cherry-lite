import { getSidebarIconLabelKey } from '@renderer/i18n/label'
import type { SidebarAppId } from '@renderer/utils/sidebar'
import { getSidebarFavoriteKey, getSidebarMenuPath, isSidebarAppId } from '@renderer/utils/sidebar'
import type { SidebarFavoriteItem } from '@shared/data/preference/preferenceTypes'

import type { ResolvedSidebarEntry } from '../Sidebar'
import { SIDEBAR_ICON_COMPONENTS } from './sidebarIcons'

/**
 * Runtime context a variant needs to resolve a favorite into a rendered row:
 * i18n and the open/remove callbacks the container owns.
 */
export interface SidebarVariantContext {
  t: (key: string) => string
  isRequiredApp: (id: SidebarAppId) => boolean
  openApp: (id: SidebarAppId) => void
  removeApp: (id: SidebarAppId) => void
}

/**
 * One sidebar item type's whole behavior in a single object: how a stored
 * favorite of that type resolves into a rendered, type-agnostic row (icon, label,
 * active-match, open action, context menu), or `null` when it is not renderable
 * (missing icon/route). Adding a new sidebar item type
 * = one new descriptor here plus a `case` in `resolveSidebarEntry`.
 */
interface SidebarVariantDescriptor<T extends SidebarFavoriteItem> {
  resolve: (item: T, ctx: SidebarVariantContext) => ResolvedSidebarEntry | null
}

const appVariant: SidebarVariantDescriptor<Extract<SidebarFavoriteItem, { type: 'app' }>> = {
  resolve: (item, ctx) => {
    const id = item.id
    if (!isSidebarAppId(id)) return null
    const path = getSidebarMenuPath(id)
    const Icon = SIDEBAR_ICON_COMPONENTS[id]
    // Unrenderable app (no route or no icon) is dropped from the list but stays in
    // the preference.
    if (!path || !Icon) return null

    return {
      key: getSidebarFavoriteKey(item),
      label: ctx.t(getSidebarIconLabelKey(id)),
      renderIcon: (size) => <Icon size={size} strokeWidth={1.6} />,
      isActive: (active) => active.activeItem === id,
      onOpen: () => ctx.openApp(id),
      contextMenuItems: [
        {
          type: 'item',
          id: `sidebar.remove-app.${id}`,
          label: ctx.t('launchpad.unpin_from_sidebar'),
          enabled: !ctx.isRequiredApp(id),
          onSelect: () => ctx.removeApp(id)
        }
      ]
    }
  }
}

/**
 * Resolve one stored favorite into a rendered row via its variant descriptor, or
 * `null` when it is not renderable. The single dispatch here is the only place
 * that switches on the favorite type; every type-specific detail lives in the
 * descriptor above.
 */
export function resolveSidebarEntry(
  favorite: SidebarFavoriteItem,
  ctx: SidebarVariantContext
): ResolvedSidebarEntry | null {
  switch (favorite.type) {
    case 'app':
      return appVariant.resolve(favorite, ctx)
  }
}
