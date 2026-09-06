import { Button, Input } from '@cherrystudio/ui'
import {
  SettingDescription,
  SettingGroup,
  SettingsContentColumn,
  SettingTitle
} from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import {
  DEFAULT_TTS_SETTINGS,
  type TtsProviderId,
  type TtsSettings,
  type TtsSettingsView,
  type TtsVoice
} from '@shared/tts'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring'
const previewText = '你好，这是一段朗读试听。Hello, this is a read-aloud preview.'

function settingsFromView(view: TtsSettingsView): TtsSettings {
  const { provider, baseUrl, region, model, voice, localeVoices, rate, volume } = view
  return { provider, baseUrl, region, model, voice, localeVoices, rate, volume }
}

export default function TtsSettingsPage() {
  const { t } = useTranslation()
  const [previewSourceId] = useState(() => `tts-preview:${crypto.randomUUID()}`)
  const [settings, setSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(false)
  const alive = useRef(false)
  const busyRef = useRef(false)

  useEffect(() => {
    alive.current = true
    let active = true
    // Local settings only. Opening this page must never query a voice provider.
    void ipcApi
      .request('tts.get_settings')
      .then((view) => {
        if (!active) return
        setSettings(settingsFromView(view))
        setHasApiKey(view.hasApiKey)
        setLoaded(true)
      })
      .catch(() => {
        if (!active) return
        setError(true)
        setNotice('tts.settings.load_error')
      })
    return () => {
      active = false
      alive.current = false
    }
  }, [])

  const update = <K extends keyof TtsSettings>(key: K, value: TtsSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setNotice('')
    if (key === 'baseUrl' || key === 'region') {
      setHasApiKey(false)
      setApiKey('')
      setClearKey(false)
      setVoices([])
    }
  }
  const changeProvider = (provider: TtsProviderId) => {
    setSettings((current) => ({
      ...current,
      provider,
      baseUrl: '',
      voice: '',
      localeVoices: {},
      model: DEFAULT_TTS_SETTINGS.model
    }))
    setApiKey('')
    setHasApiKey(false)
    setClearKey(false)
    setVoices([])
    setSearch('')
    setNotice('')
  }
  const updateLocaleVoice = (locale: string, voice: string) => {
    const localeVoices = { ...settings.localeVoices }
    if (voice.trim()) localeVoices[locale] = voice.trim()
    else delete localeVoices[locale]
    update('localeVoices', localeVoices)
  }
  const save = async (followup?: 'voices' | 'preview') => {
    if (!loaded || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setNotice('')
    setError(false)
    try {
      const view = await ipcApi.request('tts.save_settings', {
        settings,
        ...(clearKey ? { apiKey: '' } : apiKey.trim() ? { apiKey: apiKey.trim() } : {})
      })
      if (!alive.current) return
      setSettings(settingsFromView(view))
      setHasApiKey(view.hasApiKey)
      setApiKey('')
      setClearKey(false)
      if (followup === 'voices') {
        const next = await ipcApi.request('tts.list_voices')
        if (alive.current) {
          setVoices(next)
          setNotice(next.length ? 'tts.settings.voices_loaded' : 'tts.settings.no_voices')
        }
      } else if (followup === 'preview') {
        const state = await ipcApi.request('tts.play', { sourceId: previewSourceId, text: previewText })
        if (alive.current) {
          setError(state.status === 'error')
          setNotice(state.status === 'error' ? 'tts.error' : 'tts.settings.preview_started')
        }
      } else {
        setNotice('tts.settings.saved')
      }
    } catch {
      if (alive.current) {
        setError(true)
        setNotice(followup ? 'tts.settings.action_error' : 'tts.settings.save_error')
      }
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  const voiceOptions = voices.filter((voice) =>
    `${voice.name} ${voice.id} ${voice.locale}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SettingsContentColumn>
      <SettingGroup>
        <SettingTitle>{t('tts.settings.title')}</SettingTitle>
        <SettingDescription>{t('tts.settings.privacy')}</SettingDescription>
        <fieldset disabled={!loaded || busy} className="mt-5 space-y-4 disabled:opacity-60">
          <label className="block space-y-2 text-sm" htmlFor="tts-provider">
            <span>{t('tts.settings.provider')}</span>
            <select
              id="tts-provider"
              className={selectClass}
              value={settings.provider}
              onChange={(event) => changeProvider(event.target.value as TtsProviderId)}>
              <option value="edge">{t('tts.settings.edge')}</option>
              <option value="openai">{t('tts.settings.openai')}</option>
              <option value="azure">{t('tts.settings.azure')}</option>
            </select>
          </label>
          {settings.provider === 'edge' ? (
            <SettingDescription>{t('tts.settings.edge_notice')}</SettingDescription>
          ) : (
            <>
              <label className="block space-y-2 text-sm" htmlFor="tts-endpoint">
                <span>{t('tts.settings.endpoint')}</span>
                <Input
                  id="tts-endpoint"
                  value={settings.baseUrl}
                  maxLength={2048}
                  placeholder={
                    settings.provider === 'openai'
                      ? 'https://api.openai.com/v1'
                      : t('tts.settings.azure_endpoint_placeholder')
                  }
                  onChange={(event) => update('baseUrl', event.target.value)}
                />
              </label>
              <SettingDescription>{t('tts.settings.endpoint_hint')}</SettingDescription>
              {settings.provider === 'openai' ? (
                <label className="block space-y-2 text-sm" htmlFor="tts-model">
                  <span>{t('tts.settings.model')}</span>
                  <Input
                    id="tts-model"
                    value={settings.model}
                    maxLength={200}
                    onChange={(event) => update('model', event.target.value)}
                  />
                </label>
              ) : (
                <label className="block space-y-2 text-sm" htmlFor="tts-region">
                  <span>{t('tts.settings.region')}</span>
                  <Input
                    id="tts-region"
                    value={settings.region}
                    maxLength={80}
                    onChange={(event) => update('region', event.target.value)}
                  />
                </label>
              )}
              <label className="block space-y-2 text-sm" htmlFor="tts-key">
                <span>{t('tts.settings.api_key')}</span>
                <Input
                  id="tts-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  maxLength={8192}
                  disabled={clearKey}
                  placeholder={t(hasApiKey ? 'tts.settings.key_saved' : 'tts.settings.key_placeholder')}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </label>
              <SettingDescription>{t('tts.settings.key_hint')}</SettingDescription>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={clearKey} onChange={(event) => setClearKey(event.target.checked)} />
                {t('tts.settings.clear_key')}
              </label>
            </>
          )}
        </fieldset>
      </SettingGroup>

      <SettingGroup>
        <SettingTitle>{t('tts.settings.voice_title')}</SettingTitle>
        <fieldset disabled={!loaded || busy} className="mt-4 space-y-4 disabled:opacity-60">
          <label className="block space-y-2 text-sm" htmlFor="tts-voice">
            <span>{t('tts.settings.voice')}</span>
            <Input
              id="tts-voice"
              value={settings.voice}
              maxLength={200}
              list="tts-voices"
              placeholder={t(
                settings.provider === 'openai' ? 'tts.settings.openai_auto_voice' : 'tts.settings.auto_voice'
              )}
              onChange={(event) => update('voice', event.target.value)}
            />
          </label>
          <SettingDescription>{t('tts.settings.voice_hint')}</SettingDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['zh', 'en'] as const).map((locale) => (
              <label key={locale} className="block space-y-2 text-sm" htmlFor={`tts-voice-${locale}`}>
                <span>{t(locale === 'zh' ? 'tts.settings.chinese_voice' : 'tts.settings.english_voice')}</span>
                <Input
                  id={`tts-voice-${locale}`}
                  value={settings.localeVoices[locale] ?? ''}
                  maxLength={200}
                  list="tts-voices"
                  placeholder={t('tts.settings.auto_voice')}
                  onChange={(event) => updateLocaleVoice(locale, event.target.value)}
                />
              </label>
            ))}
          </div>
          <Button variant="outline" onClick={() => void save('voices')}>
            {t('tts.settings.refresh_voices')}
          </Button>
          {voices.length > 0 && (
            <>
              <Input
                aria-label={t('tts.settings.search_voices')}
                placeholder={t('tts.settings.search_voices')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                aria-label={t('tts.settings.available_voices')}
                className={selectClass}
                value=""
                onChange={(event) => update('voice', event.target.value)}>
                <option value="" disabled>
                  {t('tts.settings.select_voice')}
                </option>
                {voiceOptions.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} · {voice.locale}
                  </option>
                ))}
              </select>
            </>
          )}
          <datalist id="tts-voices">
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} · {voice.locale}
              </option>
            ))}
          </datalist>
          <label className="block space-y-2 text-sm" htmlFor="tts-rate">
            <span>
              {t('tts.settings.rate')} · {settings.rate.toFixed(2)}×
            </span>
            <input
              id="tts-rate"
              className="w-full accent-primary"
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={settings.rate}
              onChange={(event) => update('rate', Number(event.target.value))}
            />
          </label>
          <label className="block space-y-2 text-sm" htmlFor="tts-volume">
            <span>
              {t('tts.settings.volume')} · {Math.round(settings.volume * 100)}%
            </span>
            <input
              id="tts-volume"
              className="w-full accent-primary"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(event) => update('volume', Number(event.target.value))}
            />
          </label>
        </fieldset>
      </SettingGroup>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button disabled={!loaded || busy} onClick={() => void save()}>
          {t('tts.settings.save')}
        </Button>
        <Button variant="outline" disabled={!loaded || busy} onClick={() => void save('preview')}>
          {t('tts.settings.preview')}
        </Button>
      </div>
      {notice && (
        <p
          role={error ? 'alert' : 'status'}
          className={`mt-3 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {t(notice)}
        </p>
      )}
    </SettingsContentColumn>
  )
}
