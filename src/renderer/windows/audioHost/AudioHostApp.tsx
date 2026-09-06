import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { ThemeProvider } from '@renderer/components/ThemeProvider'
import { WindowFatalFallback } from '@renderer/components/WindowFatalFallback'
import { useLanguageSync } from '@renderer/hooks/useLanguageSync'
import { ipcApi } from '@renderer/ipc'
import type { TtsState } from '@shared/tts'
import { LoaderCircle, Pause, Play, Volume2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AudioPlayback } from './AudioPlayback'

const errorLabels = {
  network: 'tts.errors.network',
  timeout: 'tts.errors.timeout',
  auth: 'tts.errors.auth',
  'rate-limit': 'tts.errors.rate_limit',
  'invalid-config': 'tts.errors.invalid_config',
  'invalid-response': 'tts.errors.invalid_response',
  'too-large': 'tts.errors.too_large',
  player: 'tts.errors.player'
} as const

function AudioHost() {
  const { t } = useTranslation()
  const [state, setState] = useState<TtsState>({ status: 'idle' })
  useLanguageSync()

  useEffect(() => {
    let active = true
    let stateReceived = false
    const playback = new AudioPlayback({
      audio: new Audio(),
      createUrl: (blob) => URL.createObjectURL(blob),
      revokeUrl: (url) => URL.revokeObjectURL(url),
      report: (event) => {
        void ipcApi.request('tts.host_event', event).catch(() => {})
      }
    })
    const offCommands = ipcApi.on('tts.host_command', (command) => playback.command(command))
    const offState = ipcApi.on('tts.state', (next) => {
      stateReceived = true
      setState(next)
    })
    // Subscribe before readiness: main may send the first segment immediately.
    void ipcApi.request('tts.host_ready').catch(() => {
      if (active) setState({ status: 'error' })
    })
    void ipcApi
      .request('tts.get_state')
      .then((next) => {
        if (active && !stateReceived) setState(next)
      })
      .catch(() => {})
    return () => {
      active = false
      offCommands()
      offState()
      playback.dispose()
    }
  }, [])

  const control = (action: 'pause' | 'resume' | 'stop') => {
    void ipcApi.request('tts.control', { action, sessionId: state.sessionId }).catch(() => {
      setState((current) => ({ ...current, status: 'error' }))
    })
  }
  const isPreparing = state.status === 'preparing'
  const isPaused = state.status === 'paused'
  const errorLabel = state.errorCode ? errorLabels[state.errorCode] : 'tts.error'
  const buttonClass =
    'no-drag flex size-9 shrink-0 items-center justify-center rounded-lg text-popover-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40'

  return (
    <div className="drag flex h-screen items-center gap-3 rounded-xl border border-border bg-popover px-3 text-popover-foreground shadow-lg">
      {isPreparing ? (
        <LoaderCircle size={20} className="shrink-0 animate-spin text-primary" />
      ) : (
        <Volume2 size={20} className="shrink-0 text-primary" />
      )}
      <div
        className="min-w-0 flex-1"
        role="status"
        aria-live="polite"
        title={
          state.status === 'error' ? (state.errorCode ? t(errorLabel) : state.error || t('tts.error')) : undefined
        }>
        <div className="truncate font-medium text-sm">{t('tts.title')}</div>
        <div className="truncate text-muted-foreground text-xs">
          {state.status === 'error'
            ? t(errorLabel)
            : isPreparing
              ? t('tts.preparing')
              : isPaused
                ? t('tts.paused')
                : state.status === 'playing'
                  ? t('tts.playing')
                  : t('tts.idle')}
          {state.segmentCount ? ` · ${(state.segmentIndex ?? 0) + 1}/${state.segmentCount}` : ''}
        </div>
      </div>
      <button
        type="button"
        className={buttonClass}
        disabled={state.status !== 'playing' && !isPaused}
        aria-label={t(isPaused ? 'tts.resume' : 'tts.pause')}
        onClick={() => control(isPaused ? 'resume' : 'pause')}>
        {isPaused ? <Play size={18} /> : <Pause size={18} />}
      </button>
      <button type="button" className={buttonClass} aria-label={t('tts.stop')} onClick={() => control('stop')}>
        <X size={18} />
      </button>
    </div>
  )
}

export default function AudioHostApp() {
  return (
    <ErrorBoundary fallbackComponent={WindowFatalFallback}>
      <ThemeProvider>
        <AudioHost />
      </ThemeProvider>
    </ErrorBoundary>
  )
}
