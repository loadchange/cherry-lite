import { application } from '@application'
import type { ttsRequestSchemas } from '@shared/ipc/schemas/tts'
import type { IpcHandlersFor } from '@shared/ipc/types'

function requireWindow(senderId: string | null): string {
  if (!senderId) throw new Error('TTS requests require a managed application window.')
  return senderId
}

export const ttsHandlers: IpcHandlersFor<typeof ttsRequestSchemas> = {
  'tts.get_settings': async (_, { senderId }) => {
    requireWindow(senderId)
    return application.get('TtsService').getSettings()
  },
  'tts.save_settings': async ({ settings, apiKey }, { senderId }) => {
    requireWindow(senderId)
    return application.get('TtsService').saveSettings(settings, apiKey)
  },
  'tts.list_voices': async (_, { senderId }) => {
    requireWindow(senderId)
    return application.get('TtsService').listVoices()
  },
  'tts.get_state': async (_, { senderId }) => {
    requireWindow(senderId)
    return application.get('TtsService').getState()
  },
  'tts.play': async (request, { senderId }) => application.get('TtsService').play(request, requireWindow(senderId)),
  'tts.control': async (request, { senderId }) =>
    application.get('TtsService').control(request, requireWindow(senderId)),
  'tts.host_ready': async (_, { senderId }) => application.get('TtsService').hostReady(requireWindow(senderId)),
  'tts.host_event': async (event, { senderId }) =>
    application.get('TtsService').hostEvent(event, requireWindow(senderId))
}
