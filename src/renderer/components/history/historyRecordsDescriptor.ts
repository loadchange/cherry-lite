import type { ResolvedAction } from '@renderer/components/chat/actions/actionTypes'
import type { ReactElement, ReactNode } from 'react'

import type { HistoryBulkMoveTarget, HistoryRecordsMode, HistorySourceOption } from './historyRecordsTypes'

/** Callback the row passes to the menu preset so a menu item can open the rename dialog. */
export type HistoryOpenRename = (id: string, name: string) => void

/** Per-row menu/action wiring produced from a mode's menu preset. */
export interface HistoryRowActions {
  actions: readonly ResolvedAction[]
  onAction: (action: ResolvedAction) => void | Promise<void>
}

/** i18n strings the history surface renders. */
export interface HistoryRecordsStrings {
  /** Filter-bar source field label. */
  sourceLabel: string
  /** Keyword search placeholder. */
  searchPlaceholder: string
  /** Title-column header label. */
  titleColumnLabel: string
  emptyTitle: string
  emptyDescription: string
  loadingTitle: string
  loadingDescription: string
  pinLabel: string
  unpinLabel: string
  deleteLabel: string
  renameDialogTitle: string
}

/**
 * Captures the record-type specifics as data, so the controller, content, filter bar, toolbar,
 * and list stay generic.
 */
export interface HistoryRecordDescriptor<T> {
  mode: HistoryRecordsMode

  // --- identity + filtering (consumed by useHistoryRecordsController) ---
  getId: (item: T) => string
  isPinned: (id: string) => boolean
  getSourceId: (item: T) => string
  matchesSearch: (item: T, keywords: string) => boolean
  /** Runs the mode's bulk-delete mutation; resolves to the deleted ids, or undefined on failure/no-op. */
  onBulkDelete: (ids: string[]) => Promise<readonly string[] | undefined>
  /** Switch the active record after the current one was deleted (null clears it). */
  onActiveRecordChange: (item: T | null) => void

  // --- rendering (consumed by HistoryRecordList / HistoryRecordRow) ---
  getName: (item: T) => string
  getUpdatedAt: (item: T) => string
  getSourceLabel: (item: T) => string
  renderAvatar: (item: T) => ReactNode
  rowHeight: number
  getSelectLabel: (item: T) => string
  /** Build the row's menu actions; `openRename` lets a menu item open the rename dialog. */
  getRowActions: (item: T, openRename: HistoryOpenRename) => HistoryRowActions
  onOpen: (item: T) => void
  onTogglePin: (item: T) => boolean | void | Promise<boolean | void>
  /** Wrap a rendered row with its right-click context menu (returns the row unchanged if empty). */
  renderRowMenu: (item: T, row: ReactElement, actions: HistoryRowActions) => ReactElement

  // --- filter bar + toolbar ---
  /** Valid source ids (assistants that exist) — drives the "selected source vanished" reset. */
  sources: HistorySourceOption[]
  /** Renders the shared assistant selector as the source filter (null = all). */
  renderSourceFilter: (selectedId: string | null, onSelect: (id: string | null) => void) => ReactNode
  bulkMoveTargets?: readonly HistoryBulkMoveTarget[]
  /** Move `ids` to `targetId`; resolves to the ids actually moved (for selection pruning). */
  onBulkMove?: (targetId: string, ids: string[]) => Promise<readonly string[] | undefined>

  // --- rename dialog + strings ---
  onRename: (id: string, name: string) => void | Promise<void>
  strings: HistoryRecordsStrings
}
