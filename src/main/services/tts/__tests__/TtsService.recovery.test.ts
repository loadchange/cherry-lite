import { EventEmitter } from 'node:events'

import { BaseService } from '@main/core/lifecycle'
import { WindowType } from '@main/core/window/types'
import { DEFAULT_TTS_SETTINGS } from '@shared/tts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as TtsProviders from '../providers'
import { TtsService } from '../TtsService'

const mocks = vi.hoisted(() => ({ get: vi.fn(), send: vi.fn(), broadcast: vi.fn(), synthesize: vi.fn() }))
vi.mock('@application', () => ({ application: { get: mocks.get, getPath: () => '/test' } }))
vi.mock('../providers', async (importOriginal) => ({
  ...(await importOriginal<typeof TtsProviders>()),
  getTtsProvider: () => ({ capabilities: { maxTextBytes: 3000 }, synthesize: mocks.synthesize })
}))
vi.mock('../TtsCredentialStore', () => ({ TtsCredentialStore: class {} }))
vi.mock('electron', () => ({
  ipcMain: {},
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 800 } })
  }
}))

const tick = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve()
}
type Managed = {
  id: string
  type: WindowType
  window: EventEmitter & {
    webContents: EventEmitter
    isDestroyed: () => boolean
    isVisible: () => boolean
    showInactive: () => void
  }
}

describe('TtsService failed-host recovery', () => {
  let service: TtsService
  let created: (window: Managed) => void
  let destroyed: (window: Managed) => void
  let hostCount = 0
  const windows = new Map<string, Managed>()

  function makeWindow(id: string, type: WindowType): Managed {
    const managed = {
      id,
      type,
      window: Object.assign(new EventEmitter(), {
        webContents: new EventEmitter(),
        isDestroyed: () => false,
        isVisible: () => true,
        showInactive: vi.fn()
      })
    }
    windows.set(id, managed)
    created(managed)
    return managed
  }

  const wm = {
    onWindowCreated: (callback: typeof created) => {
      created = callback
      return () => undefined
    },
    onWindowDestroyed: (callback: typeof destroyed) => {
      destroyed = callback
      return () => undefined
    },
    getWindow: (id: string) => windows.get(id)?.window,
    getWindowType: (id: string) => windows.get(id)?.type,
    open: vi.fn(() => {
      const id = `host-${++hostCount}`
      makeWindow(id, WindowType.AudioHost)
      return id
    }),
    destroy: vi.fn((id: string) => {
      const managed = windows.get(id)
      if (!managed) return
      windows.delete(id)
      managed.window.isDestroyed = () => true
      destroyed(managed)
    })
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    windows.clear()
    hostCount = 0
    mocks.synthesize.mockResolvedValue({ audio: new Uint8Array([1, 2]), mimeType: 'audio/mpeg' })
    mocks.get.mockImplementation((name) => {
      if (name === 'WindowManager') return wm
      if (name === 'IpcApiService') return { send: mocks.send, broadcast: mocks.broadcast }
      if (name === 'PreferenceService') return { get: () => DEFAULT_TTS_SETTINGS }
      throw new Error(name)
    })
    BaseService.resetInstances()
    service = new TtsService()
    await service._doInit()
    makeWindow('owner', WindowType.Main)
  })

  afterEach(async () => {
    await service._doStop()
    vi.useRealTimers()
  })

  async function start(text = 'First') {
    const state = service.play({ text, sourceId: text }, 'owner')
    await tick()
    return state
  }

  it('recreates a crashed ready host on the next explicit read', async () => {
    await start()
    service.hostReady('host-1')
    await tick()
    windows.get('host-1')!.window.webContents.emit('render-process-gone')

    const retry = await start('Retry')
    expect(wm.open).toHaveBeenCalledTimes(2)
    service.hostReady('host-2')
    await tick()
    expect(mocks.send).toHaveBeenCalledWith(
      'host-2',
      'tts.host_command',
      expect.objectContaining({ type: 'segment', sessionId: retry.sessionId })
    )
  })

  it('recreates a timed-out host immediately instead of reusing its rejected readiness promise', async () => {
    await start()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(service.getState().status).toBe('error')

    const retry = await start('Retry')
    expect(wm.open).toHaveBeenCalledTimes(2)
    service.hostReady('host-2')
    await tick()
    expect(mocks.send).toHaveBeenCalledWith(
      'host-2',
      'tts.host_command',
      expect.objectContaining({ type: 'segment', sessionId: retry.sessionId })
    )
  })

  it('cleans up a synchronous open failure and permits the next read without an orphan rejection', async () => {
    wm.open.mockImplementationOnce(() => {
      throw new Error('Window creation failed')
    })
    await start()
    expect(service.getState().status).toBe('error')
    const retry = await start('Retry')
    service.hostReady('host-1')
    await tick()
    expect(mocks.send).toHaveBeenCalledWith(
      'host-1',
      'tts.host_command',
      expect.objectContaining({ type: 'segment', sessionId: retry.sessionId })
    )
  })

  it('ignores a late renderer-failure notification from an already destroyed host', async () => {
    await start()
    service.hostReady('host-1')
    await tick()
    const oldHost = windows.get('host-1')!
    wm.destroy('host-1')

    const next = await start('Next')
    service.hostReady('host-2')
    await tick()
    service.hostEvent({ sessionId: next.sessionId!, index: 0, event: 'playing' }, 'host-2')
    oldHost.window.webContents.emit('did-fail-load')
    expect(service.getState()).toMatchObject({ status: 'playing', sessionId: next.sessionId })
  })
})
