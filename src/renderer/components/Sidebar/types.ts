import type { CommandContextMenuExtraItem } from '@renderer/components/command'
import type { ReactNode } from 'react'

/** The active-route state a resolved entry matches itself against. */
export interface SidebarActiveState {
  /** Active built-in app id. */
  activeItem: string
}

/**
 * A fully-resolved, type-agnostic sidebar row. The app layer produces these from
 * the tagged favorites via the variant registry (see `components/app/sidebarVariants`);
 * the presentation layer renders them without knowing the row type.
 * Adding a new sidebar item type is a new variant descriptor — leaf item rows keep
 * this presentation contract.
 */
export interface ResolvedSidebarEntry {
  /** Stable identity — react key and reorder-matching key (`${type}:${id}`). */
  key: string
  label: string
  renderIcon: (size: number) => ReactNode
  isActive: (active: SidebarActiveState) => boolean
  onOpen: () => void
  contextMenuItems?: readonly CommandContextMenuExtraItem[]
}

export type SidebarLayout = 'hidden' | 'icon' | 'full'

export type SidebarVisibleLayout = Exclude<SidebarLayout, 'hidden'>

export interface SidebarUser {
  name: string
  avatar?: string
  onClick?: () => void
}
