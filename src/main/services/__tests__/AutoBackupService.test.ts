import { tmpdir } from 'node:os'

import { BaseService } from '@main/core/lifecycle/BaseService'
import { SchedulerService } from '@main/core/scheduler/SchedulerService'
import type * as LegacyFile from '@main/utils/legacyFile'
import { BACKUP_ACTIVE_WRITERS_ERROR_CODE } from '@shared/types/backup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AutoBackupService } from '../AutoBackupService'
import { legacyBackupManager } from '../LegacyBackupManager'

const mocks = vi.hoisted(() => ({
  applicationGet: vi.fn(),
  applicationGetPath: vi.fn((key: string) => (key === 'app.userdata' ? '/mock/userData' : '/mock/install')),
  broadcastToType: vi.fn(),
  hasWritePermission: vi.fn(async () => true),
  backupToLocalDir: vi
    .fn<
      (
        event: unknown,
        fileName: string | undefined,
        config: unknown,
        signal?: AbortSignal
      ) => Promise<{ result: string; cleanupError: Error | null }>
    >()
    .mockResolvedValue({ result: '/backups/test.zip', cleanupError: null })
}))

vi.mock('@application', () => ({ application: { get: mocks.applicationGet, getPath: mocks.applicationGetPath } }))

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })
  }
}))

vi.mock('@main/utils/legacyFile', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacyFile>()),
  hasWritePermission: mocks.hasWritePermission
}))

vi.mock('../LegacyBackupManager', () => {
  class BackupOperationBusyError extends Error {}

  return {
    BackupOperationBusyError,
    legacyBackupManager: {
      backupToLocalDir: mocks.backupToLocalDir
    }
  }
})

const enabledPreferences: Record<string, unknown> = {
  'data.backup.local.auto_sync': true,
  'data.backup.local.dir': tmpdir(),
  'data.backup.local.max_backups': 0,
  'data.backup.local.skip_backup_file': false,
  'data.backup.local.sync_interval': 1
}

describe('AutoBackupService', () => {
  let service: AutoBackupService
  let scheduler: SchedulerService
  let preferences: Record<string, unknown>
  let preferenceListener: ((key: string, newValue: unknown, oldValue: unknown) => void) | undefined

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    BaseService.resetInstances()
    preferences = { ...enabledPreferences }

    const preferenceService = {
      get: vi.fn((key: string) => preferences[key]),
      subscribeMultipleChanges: vi.fn((_keys, listener) => {
        preferenceListener = listener
        return vi.fn()
      })
    }

    scheduler = new SchedulerService()
    service = new AutoBackupService()
    mocks.applicationGet.mockImplementation((name: string) => {
      if (name === 'PreferenceService') return preferenceService
      if (name === 'SchedulerService') return scheduler
      if (name === 'IpcApiService') return { broadcastToType: mocks.broadcastToType }
      throw new Error(`Unexpected service: ${name}`)
    })

    await scheduler._doInit()
    await service._doInit()
    await service._doAllReady()
  })

  afterEach(async () => {
    await service._doStop()
    await scheduler._doStop()
    vi.useRealTimers()
    BaseService.resetInstances()
  })

  const setPreference = (key: string, value: unknown) => {
    const oldValue = preferences[key]
    preferences[key] = value
    preferenceListener?.(key, value, oldValue)
  }

  it('restores the enabled automatic backup schedule after application startup', async () => {
    await vi.advanceTimersByTimeAsync(3_000)
    expect(legacyBackupManager.backupToLocalDir).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(61_000)
    expect(legacyBackupManager.backupToLocalDir).toHaveBeenCalledTimes(2)
  })

  it('restores the enabled automatic backup schedule after a service restart', async () => {
    await service._doStop()
    await service._doInit()

    expect(scheduler.has('auto-backup:local')).toBe(true)
  })

  it('schedules from a manual completion when automatic backup is enabled later', async () => {
    setPreference('data.backup.local.auto_sync', false)

    service.recordManualBackupCompletion('local')
    setPreference('data.backup.local.auto_sync', true)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(legacyBackupManager.backupToLocalDir).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(59_000)
    expect(legacyBackupManager.backupToLocalDir).toHaveBeenCalledOnce()
  })

  it('does not reschedule after automatic backup is disabled during an upload', async () => {
    let finishBackup: (() => void) | undefined
    mocks.backupToLocalDir.mockImplementationOnce(
      () =>
        new Promise<{ result: string; cleanupError: null }>((resolve) => {
          finishBackup = () => resolve({ result: '/backups/test.zip', cleanupError: null })
        })
    )

    await vi.advanceTimersByTimeAsync(1_000)
    expect(mocks.backupToLocalDir).toHaveBeenCalledOnce()

    setPreference('data.backup.local.auto_sync', false)
    finishBackup?.()
    vi.runAllTicks()
    await vi.advanceTimersByTimeAsync(5 * 60_000)

    expect(mocks.backupToLocalDir).toHaveBeenCalledOnce()
    expect(scheduler.has('auto-backup:local')).toBe(false)
  })

  it('rejects a local backup directory inside application data before creating a backup', async () => {
    setPreference('data.backup.local.dir', '/mock/userData/partial-path')

    await vi.advanceTimersByTimeAsync(1_000)

    expect(legacyBackupManager.backupToLocalDir).not.toHaveBeenCalled()
  })

  it('warns without uploading again when old backup cleanup fails', async () => {
    preferences['data.backup.local.max_backups'] = 1
    mocks.backupToLocalDir.mockResolvedValueOnce({
      result: '/backups/test.zip',
      cleanupError: new Error('delete denied')
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(7_000)

    expect(legacyBackupManager.backupToLocalDir).toHaveBeenCalledOnce()
    expect(mocks.broadcastToType).toHaveBeenCalledWith(
      expect.anything(),
      'backup.auto_sync_state_changed',
      expect.objectContaining({ type: 'local', status: 'warning', reason: 'cleanup_failed' })
    )
    expect(mocks.broadcastToType).not.toHaveBeenCalledWith(
      expect.anything(),
      'backup.auto_sync_state_changed',
      expect.objectContaining({ type: 'local', status: 'succeeded' })
    )
  })

  it('aborts an active automatic backup while stopping', async () => {
    let uploadSignal: AbortSignal | undefined
    mocks.backupToLocalDir.mockImplementationOnce(
      (_event, _fileName, _config, signal) =>
        new Promise<{ result: string; cleanupError: null }>((_resolve, reject) => {
          uploadSignal = signal
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
    )

    await vi.advanceTimersByTimeAsync(1_000)
    await service._doStop()

    expect(uploadSignal?.aborted).toBe(true)
  })

  it('emits one failure after the retry budget is exhausted', async () => {
    mocks.backupToLocalDir.mockRejectedValue(
      new Error(`${BACKUP_ACTIVE_WRITERS_ERROR_CODE}: A conversation is still running.`)
    )

    await vi.advanceTimersByTimeAsync(1_000 + 7_000 + 17_000 + 37_000)

    expect(mocks.backupToLocalDir).toHaveBeenCalledTimes(4)
    expect(mocks.broadcastToType).toHaveBeenCalledWith(
      expect.anything(),
      'backup.auto_sync_state_changed',
      expect.objectContaining({ type: 'local', status: 'failed', errorMessage: expect.stringContaining('BACKUP') })
    )

    const failure = service.getStateSnapshot().pendingNotifications[0]
    expect(failure).toMatchObject({ type: 'local', status: 'failed' })
    service.acknowledgeNotification(failure.type, failure.id)
    expect(service.getStateSnapshot().pendingNotifications).toEqual([])
  })

  it('keeps the last result in snapshots while the next backup is running', () => {
    ;(service as any).emit({ type: 'local', status: 'succeeded', timestamp: 123 })
    ;(service as any).emit({ type: 'local', status: 'running' })

    expect(service.getStateSnapshot().events.filter((event) => event.type === 'local')).toMatchObject([
      { status: 'succeeded', timestamp: 123 },
      { status: 'running' }
    ])
  })
})
