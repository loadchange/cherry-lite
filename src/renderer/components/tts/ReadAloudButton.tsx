import { stopTtsSource, useTts } from '@renderer/hooks/useTts'
import { toast } from '@renderer/services/toast'
import { cn } from '@renderer/utils/style'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle'
import Pause from 'lucide-react/dist/esm/icons/pause'
import Play from 'lucide-react/dist/esm/icons/play'
import Square from 'lucide-react/dist/esm/icons/square'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  sourceId: string
  text: string
  locale?: string
  disabled?: boolean
  label?: string
  showLabel?: boolean
  className?: string
  stopOnUnmount?: boolean
  stopWhenHidden?: boolean
}

export default function ReadAloudButton({
  sourceId,
  text,
  locale,
  disabled = false,
  label,
  showLabel = false,
  className,
  stopOnUnmount = true,
  stopWhenHidden = false
}: Props) {
  const { t } = useTranslation()
  const { state, play, control } = useTts()
  const [failed, setFailed] = useState(false)
  const pending = useRef(false)
  const own = state.sourceId === sourceId
  const active = own && ['preparing', 'playing', 'paused'].includes(state.status)
  const unavailable = disabled || !text.trim()

  useEffect(() => {
    return () => {
      if (stopOnUnmount) stopTtsSource(sourceId)
    }
  }, [sourceId, stopOnUnmount])

  useEffect(() => {
    if (unavailable && stopOnUnmount) stopTtsSource(sourceId)
  }, [sourceId, stopOnUnmount, unavailable])

  useEffect(() => {
    if (!stopWhenHidden) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopTtsSource(sourceId)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [sourceId, stopWhenHidden])

  const action =
    own && state.status === 'playing'
      ? 'pause'
      : own && state.status === 'paused'
        ? 'resume'
        : own && state.status === 'preparing'
          ? 'stop'
          : 'play'
  const title =
    action === 'play'
      ? failed || (own && state.status === 'error')
        ? t('tts.retry')
        : (label ?? t('tts.read_aloud'))
      : action === 'pause'
        ? t('tts.pause')
        : action === 'resume'
          ? t('tts.resume')
          : t('tts.stop')
  const Icon =
    own && state.status === 'preparing'
      ? LoaderCircle
      : action === 'pause'
        ? Pause
        : action === 'resume'
          ? Play
          : Volume2

  const execute = async (requested: typeof action) => {
    if (pending.current && requested === 'play') return
    pending.current = true
    setFailed(false)
    try {
      if (requested === 'play') await play({ sourceId, text, locale })
      else await control({ action: requested, sourceId, sessionId: own ? state.sessionId : undefined })
    } catch {
      setFailed(true)
      toast.error(t('tts.error'))
    } finally {
      pending.current = false
    }
  }

  const buttonClass = cn(
    'inline-flex size-7 shrink-0 items-center justify-center gap-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
    showLabel && 'w-auto px-2 text-xs',
    className
  )
  return (
    <span className="inline-flex h-full items-center gap-0.5" data-tts-source={sourceId}>
      <button
        type="button"
        aria-label={title}
        title={action === 'play' ? `${title} — ${t('tts.privacy_short')}` : title}
        aria-pressed={active}
        disabled={unavailable}
        className={buttonClass}
        onClick={(event) => {
          event.stopPropagation()
          void execute(action)
        }}>
        <Icon size={15} className={own && state.status === 'preparing' ? 'animate-spin' : undefined} />
        {showLabel && title}
      </button>
      {active && state.status !== 'preparing' && (
        <button
          type="button"
          aria-label={t('tts.stop')}
          title={t('tts.stop')}
          className={buttonClass}
          onClick={(event) => {
            event.stopPropagation()
            void execute('stop')
          }}>
          <Square size={13} />
        </button>
      )}
    </span>
  )
}
