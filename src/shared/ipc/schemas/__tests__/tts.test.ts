import { DEFAULT_TTS_SETTINGS, type TtsSettingsView } from '@shared/tts'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type * as z from 'zod'

import { ttsRequestSchemas, ttsSettingsSchema } from '../tts'

describe('TTS IPC schemas', () => {
  describe('play requests', () => {
    const schema = ttsRequestSchemas['tts.play'].input

    it('accepts the maximum text, source and locale lengths', () => {
      expect(
        schema.safeParse({ sourceId: 's'.repeat(512), text: '字'.repeat(100_000), locale: 'l'.repeat(80) }).success
      ).toBe(true)
    })

    it.each([
      { sourceId: 'source', text: '' },
      { sourceId: 'source', text: '字'.repeat(100_001) },
      { sourceId: '', text: 'Hello' },
      { sourceId: 's'.repeat(513), text: 'Hello' },
      { sourceId: 'source', text: 'Hello', locale: 'l'.repeat(81) },
      { sourceId: 'source', text: 123 },
      { sourceId: 123, text: 'Hello' }
    ])('rejects an invalid play request at case %#', (request) => {
      expect(schema.safeParse(request).success).toBe(false)
    })

    it('allows the locale to be omitted', () => {
      expect(schema.parse({ sourceId: 'source', text: 'Hello' })).toEqual({ sourceId: 'source', text: 'Hello' })
    })
  })

  describe('settings', () => {
    it.each(['', 'https://api.openai.com/v1', 'https://speech.example.test/custom/v1', 'http://localhost:8080/v1'])(
      'accepts the HTTP(S) endpoint %s',
      (baseUrl) => {
        expect(ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, baseUrl }).success).toBe(true)
      }
    )

    it.each([
      'file:///tmp/speech',
      'data:audio/mpeg;base64,AAAA',
      'javascript:alert(1)',
      'ftp://speech.example.test',
      'ws://speech.example.test',
      '/relative/v1',
      'not-a-url',
      'https://secret@speech.example.test/v1',
      'https://user:secret@speech.example.test/v1',
      'https://speech.example.test/v1?api_key=secret',
      'https://speech.example.test/v1?region=eastus',
      'https://speech.example.test/v1#secret',
      `https://speech.example.test/${'a'.repeat(2048)}`
    ])('rejects unsafe or malformed endpoint %s', (baseUrl) => {
      expect(ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, baseUrl }).success).toBe(false)
    })

    it.each(['edge', 'openai', 'azure'])('accepts the supported provider %s', (provider) => {
      expect(ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, provider }).success).toBe(true)
    })

    it('rejects an unsupported provider', () => {
      expect(ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, provider: 'unknown' }).success).toBe(false)
    })

    it.each([0.5, 1, 2])('accepts rate %s', (rate) => {
      expect(ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, rate }).success).toBe(true)
    })

    it.each([0.49, 2.01, Number.NaN, Number.POSITIVE_INFINITY, '1'])('rejects rate %s', (rate) => {
      expect(ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, rate }).success).toBe(false)
    })

    it.each([0, 0.5, 1])('accepts volume %s', (volume) => {
      expect(ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, volume }).success).toBe(true)
    })

    it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, '1'])('rejects volume %s', (volume) => {
      expect(ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, volume }).success).toBe(false)
    })

    it('accepts voice, model, region and locale voice map limits', () => {
      const localeVoices = Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [`locale-${index}`, 'v'.repeat(200)])
      )
      expect(
        ttsSettingsSchema.safeParse({
          ...DEFAULT_TTS_SETTINGS,
          voice: 'v'.repeat(200),
          model: 'm'.repeat(200),
          region: 'a'.repeat(80),
          localeVoices
        }).success
      ).toBe(true)
      expect(
        ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, localeVoices: { ['l'.repeat(80)]: 'voice' } }).success
      ).toBe(true)
    })

    it.each([
      { voice: 'v'.repeat(201) },
      { model: 'm'.repeat(201) },
      { region: 'a'.repeat(81) },
      { region: 'eastus/path' },
      { region: 'eastus?key=secret' },
      { localeVoices: { ['l'.repeat(81)]: 'voice' } },
      { localeVoices: Object.fromEntries([['en-US', 'v'.repeat(201)]]) },
      { localeVoices: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`locale-${index}`, 'voice'])) }
    ])('rejects invalid settings at case %#', (settings) => {
      expect(ttsSettingsSchema.safeParse({ ...DEFAULT_TTS_SETTINGS, ...settings }).success).toBe(false)
    })

    it('strips raw credential fields from the settings input', () => {
      const settings = ttsSettingsSchema.parse({
        ...DEFAULT_TTS_SETTINGS,
        apiKey: 'nested-secret',
        token: 'nested-token',
        authorization: 'Bearer secret',
        hasApiKey: true
      })
      expect(settings).toEqual(DEFAULT_TTS_SETTINGS)
    })

    it('only accepts credential updates in the explicit save request field', () => {
      const schema = ttsRequestSchemas['tts.save_settings'].input
      expect(
        schema.parse({
          settings: { ...DEFAULT_TTS_SETTINGS, apiKey: 'nested-secret' },
          apiKey: 'explicit-secret',
          token: 'unexpected-token'
        })
      ).toEqual({ settings: DEFAULT_TTS_SETTINGS, apiKey: 'explicit-secret' })
      expect(schema.safeParse({ settings: DEFAULT_TTS_SETTINGS }).success).toBe(true)
      expect(schema.safeParse({ settings: DEFAULT_TTS_SETTINGS, apiKey: '' }).success).toBe(true)
      expect(schema.safeParse({ settings: DEFAULT_TTS_SETTINGS, apiKey: 'k'.repeat(8192) }).success).toBe(true)
      expect(schema.safeParse({ settings: DEFAULT_TTS_SETTINGS, apiKey: 'k'.repeat(8193) }).success).toBe(false)
    })

    it('exposes only key presence in the public settings view type', () => {
      // Output schemas currently use z.custom<T>(), so this verifies the contract type,
      // not runtime output sanitization (which is the service's responsibility).
      expectTypeOf<Extract<keyof TtsSettingsView, 'apiKey' | 'token' | 'authorization'>>().toEqualTypeOf<never>()
      expectTypeOf<TtsSettingsView['hasApiKey']>().toEqualTypeOf<boolean>()
      expectTypeOf<
        z.output<(typeof ttsRequestSchemas)['tts.get_settings']['output']>
      >().toEqualTypeOf<TtsSettingsView>()
      expectTypeOf<
        z.output<(typeof ttsRequestSchemas)['tts.save_settings']['output']>
      >().toEqualTypeOf<TtsSettingsView>()
    })
  })

  describe('audio host events', () => {
    const schema = ttsRequestSchemas['tts.host_event'].input

    it.each(['playing', 'ended', 'error'])('accepts the %s event with a nonnegative integer index', (event) => {
      expect(schema.safeParse({ sessionId: 's'.repeat(100), index: 0, event }).success).toBe(true)
      expect(schema.safeParse({ sessionId: 'session', index: 12, event }).success).toBe(true)
    })

    it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '0'])(
      'rejects an invalid host segment index %s',
      (index) => {
        expect(schema.safeParse({ sessionId: 'session', index, event: 'ended' }).success).toBe(false)
      }
    )

    it('rejects unsupported events, oversized session IDs and missing indexes', () => {
      expect(schema.safeParse({ sessionId: 'session', index: 0, event: 'paused' }).success).toBe(false)
      expect(schema.safeParse({ sessionId: 's'.repeat(101), index: 0, event: 'ended' }).success).toBe(false)
      expect(schema.safeParse({ sessionId: 'session', event: 'ended' }).success).toBe(false)
    })
  })
})
