/**
 * Local backup storage config. Cross-process: the renderer manages it via the
 * settings UI and the main process consumes it in the backup services.
 */

export type LocalBackupConfig = {
  localBackupDir?: string
  maxBackups?: number
  skipBackupFile?: boolean
}

export type BackupResult<T> = {
  result: T
  cleanupFailed: boolean
}

export const AUTO_BACKUP_TYPES = ['local'] as const
export type AutoBackupType = (typeof AUTO_BACKUP_TYPES)[number]

export type AutoBackupEventInput =
  | { type: AutoBackupType; status: 'running' }
  | { type: AutoBackupType; status: 'stopped' }
  | { type: AutoBackupType; status: 'succeeded'; timestamp: number }
  | { type: AutoBackupType; status: 'warning'; timestamp: number; reason: 'cleanup_failed' }
  | { type: AutoBackupType; status: 'failed'; timestamp: number; errorMessage: string }

export type AutoBackupEvent = AutoBackupEventInput & { id: number }

export type AutoBackupSnapshot = {
  events: AutoBackupEvent[]
  pendingNotifications: AutoBackupEvent[]
}

export const BACKUP_ACTIVE_WRITERS_ERROR_CODE = 'BACKUP_ACTIVE_WRITERS'
