import { EventEmitter } from 'node:events'

import { BaseService } from '@main/core/lifecycle'
import { WindowType } from '@main/core/window/types'
import { DEFAULT_TTS_SETTINGS } from '@shared/tts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as TtsProviders from '../providers'
import { TtsService } from '../TtsService'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  send: vi.fn(),
  broadcast: vi.fn(),
  synthesize: vi.fn(),
  credentials: { has: vi.fn(), save: vi.fn(), resolve: vi.fn() }
}))
vi.mock('@application', () => ({ application: { get: mocks.get, getPath: () => '/test' } }))
vi.mock('../providers', async (importOriginal) => ({
  ...(await importOriginal<typeof TtsProviders>()),
  getTtsProvider: () => ({
    capabilities: { maxTextBytes: 3000 },
    synthesize: mocks.synthesize,
    listVoices: async () => []
  })
}))
vi.mock('../TtsCredentialStore', () => ({
  TtsCredentialStore: class {
    has = mocks.credentials.has
    save = mocks.credentials.save
    resolve = mocks.credentials.resolve
  }
}))
vi.mock('electron', () => ({
  ipcMain: {},
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 800 } })
  }
}))

const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

describe('TtsService window lifecycle and IPC authority', () => {
  let service: TtsService
  let created: (managed: any) => void
  let destroyed: (managed: any) => void
  let settings = structuredClone(DEFAULT_TTS_SETTINGS)
  const windows = new Map<string, any>()
  function makeWindow(id: string, type: WindowType) {
    const window = Object.assign(new EventEmitter(), {
      webContents: new EventEmitter(),
      isDestroyed: () => false,
      isVisible: () => true,
      showInactive: vi.fn()
    })
    const managed = { id, type, window }
    windows.set(id, managed)
    created(managed)
    return managed
  }
  const wm = {
    onWindowCreated: vi.fn((callback) => {
      created = callback
      return () => {}
    }),
    onWindowDestroyed: vi.fn((callback) => {
      destroyed = callback
      return () => {}
    }),
    getWindow: (id: string) => windows.get(id)?.window,
    getWindowType: (id: string) => windows.get(id)?.type,
    open: vi.fn(() => {
      makeWindow('host', WindowType.AudioHost)
      return 'host'
    }),
    destroy: vi.fn((id: string) => {
      const managed = windows.get(id)
      windows.delete(id)
      destroyed(managed)
    })
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    windows.clear()
    settings = structuredClone(DEFAULT_TTS_SETTINGS)
    mocks.synthesize.mockResolvedValue({ audio: new Uint8Array([1, 2]), mimeType: 'audio/mpeg' })
    mocks.get.mockImplementation((name) => {
      if (name === 'WindowManager') return wm
      if (name === 'IpcApiService') return { send: mocks.send, broadcast: mocks.broadcast }
      if (name === 'PreferenceService')
        return {
          get: () => settings,
          set: async (_key: string, value: typeof settings) => {
            settings = value
          }
        }
      throw new Error(name)
    })
    BaseService.resetInstances()
    service = new TtsService()
    await service._doInit()
    makeWindow('toolbar', WindowType.SelectionToolbar)
    makeWindow('action', WindowType.SelectionAction)
    makeWindow('chat', WindowType.Main)
  })

  afterEach(async () => {
    await service._doStop()
    vi.useRealTimers()
  })

  async function start(owner = 'toolbar', sourceId = 'source') {
    const state = service.play({ sourceId, text: 'Hello' }, owner)
    await tick()
    service.hostReady('host')
    await tick()
    return state
  }

  it('starts no window/network at boot and only trusts the actual host for audio events', async () => {
    expect(wm.open).not.toHaveBeenCalled()
    expect(mocks.synthesize).not.toHaveBeenCalled()
    const state = await start()
    expect(() => service.hostReady('chat')).toThrow('Not the audio')
    expect(() => service.hostEvent({ sessionId: state.sessionId!, index: 0, event: 'ended' }, 'chat')).toThrow(
      'Not the audio'
    )
    service.hostEvent({ sessionId: state.sessionId!, index: 0, event: 'playing' }, 'host')
    expect(service.getState().status).toBe('playing')
  })

  it('toolbar hiding preserves audio; pooled action hiding stops only its own source', async () => {
    const toolbarState = await start()
    windows.get('toolbar').window.emit('hide')
    windows.get('action').window.emit('hide')
    expect(service.getState().sessionId).toBe(toolbarState.sessionId)
    await start('action')
    windows.get('action').window.emit('hide')
    expect(service.getState().status).toBe('idle')
    // Reusing the same pooled window starts a fresh session.
    const reused = await start('action', 'next-action')
    expect(reused.sessionId).not.toBe(toolbarState.sessionId)
  })

  it('does not let old cleanup or another owner stop the current session', async () => {
    const state = await start()
    service.control({ action: 'stop', sourceId: 'source' }, 'chat')
    service.control({ action: 'stop', sessionId: 'old-session' }, 'toolbar')
    service.control({ action: 'stop' }, 'chat')
    expect(service.getState().sessionId).toBe(state.sessionId)
    service.control({ action: 'stop', sourceId: 'source' }, 'toolbar')
    expect(service.getState().status).toBe('idle')
  })

  it('closing the player immediately stops audio and releases the window', async () => {
    const state = await start()
    service.control({ action: 'stop', sessionId: state.sessionId }, 'host')
    expect(service.getState().status).toBe('idle')
    expect(wm.destroy).toHaveBeenCalledWith('host')
  })

  it('destroys an idle host and recreates it for the next explicit read', async () => {
    const state = await start()
    service.hostEvent({ sessionId: state.sessionId!, index: 0, event: 'ended' }, 'host')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(wm.destroy).toHaveBeenCalledWith('host')
    await start('chat', 'next')
    expect(wm.open).toHaveBeenCalledTimes(2)
  })

  it('stops when the owner is destroyed and rejects hidden action late play', async () => {
    await start('chat')
    destroyed(windows.get('chat'))
    expect(service.getState().status).toBe('idle')
    windows.get('action').window.isVisible = () => false
    expect(() => service.play({ text: 'late', sourceId: 'stale' }, 'action')).toThrow('closed')
  })

  it('does not open an orphan player after an immediate cancel', async () => {
    service.play({ text: 'cancel', sourceId: 'immediate' }, 'toolbar')
    service.control({ action: 'stop', sourceId: 'immediate' }, 'toolbar')
    await tick()
    expect(wm.open).not.toHaveBeenCalled()
  })

  it('keeps credentials separate from settings, state and broadcasts', async () => {
    mocks.credentials.has.mockReturnValue(true)
    const settings = { ...DEFAULT_TTS_SETTINGS, provider: 'openai' as const }
    const result = await service.saveSettings(settings, 'private-key')
    expect(mocks.credentials.save).toHaveBeenCalledWith(settings, 'private-key')
    expect(result.hasApiKey).toBe(true)
    expect(JSON.stringify(result)).not.toContain('private-key')
    expect(JSON.stringify(mocks.broadcast.mock.calls)).not.toContain('private-key')
    expect(mocks.synthesize).not.toHaveBeenCalled()
  })
})
