import { join } from 'node:path'

import { application } from '@application'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { WindowType } from '@main/core/window/types'
import { ttsSettingsSchema } from '@shared/ipc/schemas/tts'
import type {
  TtsControlRequest,
  TtsHostEvent,
  TtsPlayRequest,
  TtsSettings,
  TtsSettingsView,
  TtsState,
  TtsVoice
} from '@shared/tts'
import { DEFAULT_TTS_SETTINGS } from '@shared/tts'
import { screen } from 'electron'

import { getTtsProvider, type TtsProviderConfig } from './providers'
import { TtsCredentialStore } from './TtsCredentialStore'
import { TtsSessionManager } from './TtsSessionManager'

@Injectable('TtsService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['WindowManager', 'PreferenceService'])
export class TtsService extends BaseService {
  private hostId?: string
  private hostIsReady = false
  private hostReadyPromise?: Promise<void>
  private resolveHost?: () => void
  private rejectHost?: (error: Error) => void
  private hostReadyTimer?: ReturnType<typeof setTimeout>
  private idleTimer?: ReturnType<typeof setTimeout>
  private credentials?: TtsCredentialStore
  private readonly voiceRequests = new Set<AbortController>()
  private manager = new TtsSessionManager({
    prepareHost: () => this.prepareHost(),
    sendHost: (command) => {
      if (this.hostId && this.hostIsReady)
        application.get('IpcApiService').send(this.hostId, 'tts.host_command', command)
    },
    onState: (state) => this.publish(state)
  })

  protected onInit(): void {
    const wm = application.get('WindowManager')
    this.registerDisposable(
      wm.onWindowCreated((managed) => {
        if (managed.type === WindowType.AudioHost) {
          managed.window.webContents.on('render-process-gone', () => this.handleHostFailure(managed.id))
          managed.window.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
            if (isMainFrame !== false) this.handleHostFailure(managed.id)
          })
        }
        if (managed.type === WindowType.SelectionAction) {
          // Action windows are recycled without unmounting; closing/hiding releases their audio.
          managed.window.on('hide', () => this.stopOwner(managed.id))
        }
      })
    )
    this.registerDisposable(
      wm.onWindowDestroyed((managed) => {
        if (managed.id === this.hostId) {
          this.resetHost()
          this.manager.stop()
        } else {
          this.stopOwner(managed.id)
        }
      })
    )
  }

  private getCredentialStore(): TtsCredentialStore {
    return (this.credentials ??= new TtsCredentialStore(
      join(application.getPath('app.userdata'), 'tts-credentials.json')
    ))
  }

  private readSettings(): TtsSettings {
    const saved = application.get('PreferenceService').get('tts.settings')
    const parsed = ttsSettingsSchema.safeParse(saved)
    return parsed.success ? parsed.data : structuredClone(DEFAULT_TTS_SETTINGS)
  }

  getSettings(): TtsSettingsView {
    const settings = this.readSettings()
    return { ...settings, hasApiKey: settings.provider !== 'edge' && this.getCredentialStore().has(settings) }
  }

  async saveSettings(settings: TtsSettings, apiKey?: string): Promise<TtsSettingsView> {
    const parsed = ttsSettingsSchema.parse(settings)
    if (apiKey !== undefined && parsed.provider !== 'edge') this.getCredentialStore().save(parsed, apiKey.trim())
    await application.get('PreferenceService').set('tts.settings', parsed)
    return this.getSettings()
  }

  private providerConfig(): TtsProviderConfig {
    const settings = this.readSettings()
    return {
      ...settings,
      apiKey: settings.provider === 'edge' ? undefined : this.getCredentialStore().resolve(settings)
    }
  }

  async listVoices(): Promise<TtsVoice[]> {
    // Explicit action only. Bounded even if several settings windows request a directory.
    if (this.voiceRequests.size >= 2) throw new Error('A voice directory request is already running.')
    const config = this.providerConfig()
    const controller = new AbortController()
    this.voiceRequests.add(controller)
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      return await getTtsProvider(config.provider).listVoices(config, controller.signal)
    } catch {
      throw new Error('Could not load voices. Check the network, endpoint and API key, or enter a voice manually.')
    } finally {
      clearTimeout(timer)
      this.voiceRequests.delete(controller)
    }
  }

  getState(): TtsState {
    return this.manager.getState()
  }

  play(request: TtsPlayRequest, senderId: string): TtsState {
    const wm = application.get('WindowManager')
    const source = wm.getWindow(senderId)
    if (
      !source ||
      source.isDestroyed() ||
      (wm.getWindowType(senderId) === WindowType.SelectionAction && !source.isVisible())
    ) {
      throw new Error('The reading source window has closed.')
    }
    return this.manager.play(request, senderId, this.providerConfig())
  }

  control(request: TtsControlRequest, senderId: string): void {
    const state = this.getState()
    if (request.sessionId && state.sessionId !== request.sessionId) return
    if (request.sourceId && (state.sourceId !== request.sourceId || state.ownerWindowId !== senderId)) return
    // Unscoped controls are reserved for the independent player. Other windows must
    // reference an observed session or their own source; stale cleanup is a no-op.
    if (!request.sessionId && !request.sourceId && senderId !== this.hostId) return
    this.manager[request.action]()
    if (request.action === 'stop' && senderId === this.hostId) {
      clearTimeout(this.idleTimer)
      this.releaseHost()
    }
  }

  private stopOwner(senderId: string): void {
    if (this.getState().ownerWindowId === senderId) this.manager.stop()
  }

  hostReady(senderId: string): void {
    if (senderId !== this.hostId) throw new Error('Not the audio playback host.')
    this.hostIsReady = true
    clearTimeout(this.hostReadyTimer)
    this.resolveHost?.()
    application.get('IpcApiService').send(senderId, 'tts.state', this.getState())
    application.get('WindowManager').getWindow(senderId)?.showInactive()
  }

  hostEvent(event: TtsHostEvent, senderId: string): void {
    if (senderId !== this.hostId || !this.hostIsReady) throw new Error('Not the audio playback host.')
    this.manager.hostEvent(event)
  }

  private prepareHost(): Promise<void> {
    clearTimeout(this.idleTimer)
    const wm = application.get('WindowManager')
    if (this.hostId && wm.getWindow(this.hostId) && !wm.getWindow(this.hostId)!.isDestroyed()) {
      if (this.hostIsReady) {
        wm.getWindow(this.hostId)!.showInactive()
        return Promise.resolve()
      }
      return this.hostReadyPromise!
    }
    const readiness = new Promise<void>((resolve, reject) => {
      this.resolveHost = resolve
      this.rejectHost = reject
    })
    this.hostReadyPromise = readiness
    // A synchronous open failure can reject this promise before it is returned to the manager.
    // Keep it observed while still returning the original promise to propagate startup errors.
    void readiness.catch(() => undefined)
    try {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
      const hostId = wm.open(WindowType.AudioHost, {
        options: { x: area.x + area.width - 380, y: area.y + area.height - 104 }
      })
      this.hostId = hostId
      this.hostReadyTimer = setTimeout(() => this.handleHostFailure(hostId), 15_000)
      return readiness
    } catch (error) {
      this.resetHost()
      throw error
    }
  }

  private handleHostFailure(hostId: string): void {
    // Notifications from a retired renderer must not interrupt a newer playback host.
    if (hostId !== this.hostId) return
    this.manager.hostFailed()
    this.releaseHost()
  }

  private publish(state: TtsState): void {
    application.get('IpcApiService').broadcast('tts.state', state)
    clearTimeout(this.idleTimer)
    if (state.status === 'idle' || state.status === 'error') {
      this.idleTimer = setTimeout(() => this.releaseHost(), state.status === 'idle' ? 10_000 : 60_000)
    }
  }

  private resetHost(): void {
    clearTimeout(this.hostReadyTimer)
    this.rejectHost?.(new Error('Audio host closed'))
    this.hostId = undefined
    this.hostIsReady = false
    this.hostReadyPromise = undefined
    this.resolveHost = undefined
    this.rejectHost = undefined
  }

  private releaseHost(): void {
    const id = this.hostId
    this.resetHost()
    if (id) application.get('WindowManager').destroy(id)
  }

  protected onStop(): void {
    this.manager.dispose()
    for (const controller of this.voiceRequests) controller.abort()
    this.voiceRequests.clear()
    clearTimeout(this.idleTimer)
    this.releaseHost()
  }
}
