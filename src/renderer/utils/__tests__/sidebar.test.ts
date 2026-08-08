import type { SidebarFavorite, SidebarFavoriteItem } from '@shared/data/preference/preferenceTypes'
import { describe, expect, it } from 'vitest'

import {
  getOrderedLaunchpadApps,
  getOrderedVisibleSidebarFavoriteItems,
  getOrderedVisibleSidebarFavorites,
  getSidebarFavoriteItems,
  getSidebarMenuPath,
  isMessageOnlyConversationUrl,
  reorderLaunchpadApps,
  reorderSidebarFavorites,
  resolveSidebarActiveItem,
  setSidebarAppPinned,
  SIDEBAR_FAVORITE_ORDER
} from '../sidebar'

const appFavorite = (id: SidebarFavorite): SidebarFavoriteItem => ({ type: 'app', id })

describe('sidebar config helpers', () => {
  it('keeps the fixed sidebar app order available', () => {
    expect(SIDEBAR_FAVORITE_ORDER).toEqual(['assistants', 'translate'])
  })

  it('preserves the preference order when reading ordered visible sidebar favorites', () => {
    expect(getOrderedVisibleSidebarFavorites([appFavorite('translate'), appFavorite('assistants')])).toEqual([
      'translate',
      'assistants'
    ])
  })

  it('sanitizes ordered visible sidebar favorites and keeps required favorites visible', () => {
    expect(
      getOrderedVisibleSidebarFavorites([
        appFavorite('translate'),
        { type: 'app', id: 'unknown' } as never,
        appFavorite('translate')
      ])
    ).toEqual(['assistants', 'translate'])
  })

  it('returns the full list in stored order with required apps forced in', () => {
    expect(getOrderedVisibleSidebarFavoriteItems([appFavorite('translate')])).toEqual([
      appFavorite('assistants'),
      appFavorite('translate')
    ])
  })

  it('does not prepend a required app that is already present at any position', () => {
    expect(getOrderedVisibleSidebarFavoriteItems([appFavorite('translate'), appFavorite('assistants')])).toEqual([
      appFavorite('translate'),
      appFavorite('assistants')
    ])
  })

  it('dedupes favorites and drops unknown app favorites', () => {
    expect(
      getSidebarFavoriteItems([
        appFavorite('translate'),
        appFavorite('assistants'),
        appFavorite('translate'),
        { type: 'app', id: 'unknown' } as never
      ])
    ).toEqual([appFavorite('translate'), appFavorite('assistants')])
  })

  it('drops unknown favorite types from visible reads while keeping surrounding leaves', () => {
    const group = { type: 'group', id: 'g1', name: 'Group', items: [] } as unknown as SidebarFavoriteItem

    expect(getSidebarFavoriteItems([appFavorite('translate'), group, appFavorite('assistants')])).toEqual([
      appFavorite('translate'),
      appFavorite('assistants')
    ])
  })

  it('preserves extra per-item fields through normalization (non-lossy round-trip)', () => {
    // Future per-item params must survive the normalize round-trip instead of being
    // rebuilt away from just the id.
    const appWithExtra = { type: 'app', id: 'assistants', badge: 3 } as unknown as SidebarFavoriteItem

    expect(getSidebarFavoriteItems([appWithExtra])).toEqual([{ type: 'app', id: 'assistants', badge: 3 }])
  })

  it('resolves menu paths and active items for the surviving apps', () => {
    expect(getSidebarMenuPath('assistants')).toBe('/app/chat')
    expect(getSidebarMenuPath('translate')).toBe('/app/translate')
    expect(resolveSidebarActiveItem('/app/translate')).toBe('translate')
  })

  it('resolves the active item for query-keyed conversation routes', () => {
    expect(resolveSidebarActiveItem('/app/chat?topicId=abc')).toBe('assistants')
  })

  it('resolves no active item for routes outside the sidebar apps', () => {
    expect(resolveSidebarActiveItem('/app/settings')).toBe('')
  })

  it('classifies a message-view URL as message-only only when it carries its conversation id', () => {
    expect(isMessageOnlyConversationUrl('/app/chat?topicId=topic&view=message')).toBe(true)
    // Malformed: `view=message` without an id is a bare entry, not a message-only popup.
    expect(isMessageOnlyConversationUrl('/app/chat?view=message')).toBe(false)
    expect(isMessageOnlyConversationUrl('/app/chat?topicId=topic')).toBe(false)
  })
})

describe('sidebar favorites mutations', () => {
  it('pins an app to the very end of the list', () => {
    expect(setSidebarAppPinned([appFavorite('assistants')], 'translate', true)).toEqual([
      appFavorite('assistants'),
      appFavorite('translate')
    ])
  })

  it('unpins an app while preserving the others', () => {
    expect(setSidebarAppPinned([appFavorite('assistants'), appFavorite('translate')], 'translate', false)).toEqual([
      appFavorite('assistants')
    ])
  })

  it('never unpins a required app', () => {
    expect(setSidebarAppPinned([appFavorite('assistants'), appFavorite('translate')], 'assistants', false)).toEqual([
      appFavorite('assistants'),
      appFavorite('translate')
    ])
  })

  it('preserves forward-compatible unknown items when mutating favorites', () => {
    const group = { type: 'group', id: 'g1', name: 'Group', items: [] } as unknown as SidebarFavoriteItem

    expect(setSidebarAppPinned([appFavorite('assistants'), group], 'translate', true)).toEqual([
      appFavorite('assistants'),
      appFavorite('translate'),
      group
    ])
  })
})

describe('reorderSidebarFavorites', () => {
  it('reorders favorites into the requested order', () => {
    expect(
      reorderSidebarFavorites(
        [appFavorite('assistants'), appFavorite('translate')],
        [appFavorite('translate'), appFavorite('assistants')]
      )
    ).toEqual([appFavorite('translate'), appFavorite('assistants')])
  })

  it('keeps stored favorites missing from a partial order at the end', () => {
    expect(
      reorderSidebarFavorites([appFavorite('assistants'), appFavorite('translate')], [appFavorite('translate')])
    ).toEqual([appFavorite('translate'), appFavorite('assistants')])
  })

  it('drops requested items that are not stored favorites', () => {
    expect(
      reorderSidebarFavorites([appFavorite('assistants')], [appFavorite('translate'), appFavorite('assistants')])
    ).toEqual([appFavorite('assistants')])
  })

  it('keeps a required app once when the requested reorder omits it', () => {
    const reordered = reorderSidebarFavorites([appFavorite('translate')], [appFavorite('translate')])

    expect(reordered).toEqual([appFavorite('translate'), appFavorite('assistants')])
    expect(reordered.filter((item) => item.type === 'app' && item.id === 'assistants')).toHaveLength(1)
  })
})

describe('launchpad app order (independent from sidebar favorites)', () => {
  it('falls back to the canonical order when the store is empty', () => {
    expect(getOrderedLaunchpadApps(undefined)).toEqual(SIDEBAR_FAVORITE_ORDER)
    expect(getOrderedLaunchpadApps([])).toEqual(SIDEBAR_FAVORITE_ORDER)
  })

  it('keeps the stored order first and appends missing apps in canonical order', () => {
    const ordered = getOrderedLaunchpadApps(['translate'])
    expect(ordered).toEqual(['translate', 'assistants'])
    expect(new Set(ordered).size).toBe(ordered.length)
  })

  it('drops unknown and duplicate stored ids', () => {
    const ordered = getOrderedLaunchpadApps(['translate', 'ghost', 'translate', 'assistants'])
    expect(ordered).toEqual(['translate', 'assistants'])
    expect(ordered).not.toContain('ghost')
  })

  it('reorders to the requested order and keeps missing apps at the end', () => {
    expect(reorderLaunchpadApps(['assistants', 'translate'], ['translate'])).toEqual(['translate', 'assistants'])
  })

  it('drops unknown ids from a requested reorder', () => {
    const next = reorderLaunchpadApps(['assistants', 'translate'], ['ghost', 'translate', 'assistants'])
    expect(next).toEqual(['translate', 'assistants'])
    expect(next).not.toContain('ghost')
  })
})
