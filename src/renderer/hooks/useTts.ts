import { ipcApi } from '@renderer/ipc'
import type { CherryMessagePart } from '@shared/data/types/message'
import type { TtsControlRequest, TtsPlayRequest, TtsState } from '@shared/tts'
import { useSyncExternalStore } from 'react'

const idleState: TtsState = { status: 'idle' }
let state = idleState
let revision = 0
let connection = 0
let unsubscribe: (() => void) | undefined
const listeners = new Set<() => void>()
const pendingSources = new Set<string>()

function publish(next: TtsState) {
  state = next
  revision += 1
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    const subscription = ++connection
    unsubscribe = ipcApi.on('tts.state', publish)
    const observedRevision = revision
    void ipcApi
      .request('tts.get_state')
      .then((next) => {
        if (subscription === connection && observedRevision === revision) publish(next)
      })
      .catch(() => undefined)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      connection += 1
      unsubscribe?.()
      unsubscribe = undefined
    }
  }
}

export async function playTts(request: TtsPlayRequest) {
  if (!request.text.trim()) return state
  pendingSources.add(request.sourceId)
  const observedRevision = revision
  try {
    const next = await ipcApi.request('tts.play', request)
    if (revision === observedRevision) publish(next)
    return next
  } finally {
    pendingSources.delete(request.sourceId)
  }
}

export const controlTts = (request: TtsControlRequest) => ipcApi.request('tts.control', request)

export function stopTtsSource(sourceId: string) {
  if (state.sourceId !== sourceId && !pendingSources.has(sourceId)) return
  void controlTts({ action: 'stop', sourceId }).catch(() => undefined)
}

/** Only natural-language message text; reasoning, tools, files and translations stay out. */
export function getTtsMessageText(parts: CherryMessagePart[]): string {
  return parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim()
}

/** Content changes invalidate the playback source without putting text into state broadcasts. */
export function ttsContentVersion(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  }
  return `${text.length}-${(hash >>> 0).toString(36)}`
}

export function useTts() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => idleState
  )
  return { state: snapshot, play: playTts, control: controlTts }
}
