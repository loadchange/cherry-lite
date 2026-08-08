import type { ReactNode } from 'react'

export type HistoryRecordsMode = 'assistant'

/** A selectable source (an assistant, plus the "all" and unlinked sentinels) in the filter bar. */
export interface HistorySourceOption {
  id: string
  label: string
  icon?: ReactNode
}

/** A bulk-move destination assistant. */
export interface HistoryBulkMoveTarget {
  id: string
  label: string
  icon?: ReactNode
}
