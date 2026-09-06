import type { TtsHostCommand, TtsSettingsView, TtsState, TtsVoice } from '@shared/tts'
import * as z from 'zod'

import { defineRoute } from '../define'

const endpointSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value) return true
    try {
      const url = new URL(value)
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
    } catch {
      return false
    }
  }, 'Use an HTTP(S) endpoint without credentials, query parameters or fragments')

export const ttsSettingsSchema = z.object({
  provider: z.enum(['edge', 'openai', 'azure']),
  baseUrl: endpointSchema,
  region: z
    .string()
    .max(80)
    .regex(/^[a-z0-9-]*$/),
  model: z.string().max(200),
  voice: z.string().max(200),
  localeVoices: z.record(z.string().max(80), z.string().max(200)).refine((v) => Object.keys(v).length <= 100),
  rate: z.number().min(0.5).max(2),
  volume: z.number().min(0).max(1)
})

export const ttsRequestSchemas = {
  'tts.get_settings': defineRoute({ input: z.void(), output: z.custom<TtsSettingsView>() }),
  'tts.save_settings': defineRoute({
    input: z.object({ settings: ttsSettingsSchema, apiKey: z.string().max(8192).optional() }),
    output: z.custom<TtsSettingsView>()
  }),
  'tts.list_voices': defineRoute({ input: z.void(), output: z.custom<TtsVoice[]>() }),
  'tts.get_state': defineRoute({ input: z.void(), output: z.custom<TtsState>() }),
  'tts.play': defineRoute({
    input: z.object({
      sourceId: z.string().min(1).max(512),
      text: z.string().min(1).max(100_000),
      locale: z.string().max(80).optional()
    }),
    output: z.custom<TtsState>()
  }),
  'tts.control': defineRoute({
    input: z.object({
      action: z.enum(['pause', 'resume', 'stop']),
      sessionId: z.string().max(100).optional(),
      sourceId: z.string().max(512).optional()
    }),
    output: z.void()
  }),
  'tts.host_ready': defineRoute({ input: z.void(), output: z.void() }),
  'tts.host_event': defineRoute({
    input: z.object({
      sessionId: z.string().max(100),
      index: z.number().int().nonnegative(),
      event: z.enum(['playing', 'ended', 'error'])
    }),
    output: z.void()
  })
}

export type TtsEventSchemas = {
  'tts.state': TtsState
  'tts.host_command': TtsHostCommand
}
