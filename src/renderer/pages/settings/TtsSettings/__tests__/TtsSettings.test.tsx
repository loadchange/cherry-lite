import '@testing-library/jest-dom/vitest'

import { DEFAULT_TTS_SETTINGS, type TtsSettingsView } from '@shared/tts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TtsSettingsPage from '../TtsSettingsPage'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@renderer/ipc', () => ({ ipcApi: { request } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@cherrystudio/ui', async () => {
  const React = await import('react')
  return {
    Button: ({ variant, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
      React.createElement('button', { type: 'button', 'data-variant': variant, ...props }, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => React.createElement('input', props),
    Divider: () => React.createElement('hr')
  }
})

const view: TtsSettingsView = { ...DEFAULT_TTS_SETTINGS, hasApiKey: false }

async function loaded() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'tts.settings.save' })).toBeEnabled())
}

describe('TtsSettings', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockImplementation(async (name, input) => {
      if (name === 'tts.get_settings') return view
      if (name === 'tts.save_settings') return { ...input.settings, hasApiKey: !!input.apiKey }
      if (name === 'tts.list_voices') return [{ id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', locale: 'zh-CN' }]
      if (name === 'tts.play') return { status: 'preparing' }
      throw new Error('Unexpected request')
    })
  })

  it('only loads local settings on mount; voice refresh saves before contacting the provider', async () => {
    render(<TtsSettingsPage />)
    await loaded()
    expect(request).toHaveBeenCalledExactlyOnceWith('tts.get_settings')
    fireEvent.click(screen.getByRole('button', { name: 'tts.settings.refresh_voices' }))
    await screen.findByText('tts.settings.voices_loaded')
    expect(request.mock.calls.map(([name]) => name)).toEqual([
      'tts.get_settings',
      'tts.save_settings',
      'tts.list_voices'
    ])
    fireEvent.change(screen.getByRole('combobox', { name: 'tts.settings.available_voices' }), {
      target: { value: 'zh-CN-XiaoxiaoNeural' }
    })
    expect(screen.getByLabelText('tts.settings.voice')).toHaveValue('zh-CN-XiaoxiaoNeural')
  })

  it('keeps stored secrets out of the form and omits unchanged keys from saves', async () => {
    request.mockResolvedValueOnce({ ...view, provider: 'openai', hasApiKey: true })
    render(<TtsSettingsPage />)
    await loaded()
    expect(screen.getByLabelText('tts.settings.api_key')).toHaveValue('')
    expect(screen.getByLabelText('tts.settings.api_key')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('tts.settings.api_key')).toHaveAttribute('placeholder', 'tts.settings.key_saved')
    fireEvent.click(screen.getByRole('button', { name: 'tts.settings.save' }))
    await screen.findByText('tts.settings.saved')
    const payload = request.mock.calls.find(([name]) => name === 'tts.save_settings')![1]
    expect(payload).not.toHaveProperty('apiKey')
    expect(payload.settings).not.toHaveProperty('hasApiKey')
  })

  it('supports explicitly clearing a saved credential', async () => {
    request.mockResolvedValueOnce({ ...view, provider: 'openai', hasApiKey: true })
    render(<TtsSettingsPage />)
    await loaded()
    fireEvent.click(screen.getByLabelText('tts.settings.clear_key'))
    fireEvent.click(screen.getByRole('button', { name: 'tts.settings.save' }))
    await screen.findByText('tts.settings.saved')
    expect(request.mock.calls.find(([name]) => name === 'tts.save_settings')![1].apiKey).toBe('')
  })

  it('clears provider-specific voice, endpoint and credential drafts when changing provider', async () => {
    request.mockResolvedValueOnce({
      ...view,
      provider: 'azure',
      baseUrl: 'https://speech.example',
      voice: 'zh-CN-XiaoxiaoNeural',
      localeVoices: { zh: 'zh-CN-XiaoxiaoNeural' }
    })
    render(<TtsSettingsPage />)
    await loaded()
    fireEvent.change(screen.getByLabelText('tts.settings.api_key'), { target: { value: 'secret' } })
    fireEvent.change(screen.getByLabelText('tts.settings.provider'), { target: { value: 'openai' } })
    expect(screen.getByLabelText('tts.settings.voice')).toHaveValue('')
    expect(screen.getByLabelText('tts.settings.chinese_voice')).toHaveValue('')
    expect(screen.getByLabelText('tts.settings.endpoint')).toHaveValue('')
    expect(screen.getByLabelText('tts.settings.api_key')).toHaveValue('')
  })

  it('saves before explicit preview and prevents changes while the operation is pending', async () => {
    render(<TtsSettingsPage />)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'tts.settings.preview' }))
    expect(screen.getByLabelText('tts.settings.provider')).toBeDisabled()
    await screen.findByText('tts.settings.preview_started')
    expect(request.mock.calls.map(([name]) => name)).toEqual(['tts.get_settings', 'tts.save_settings', 'tts.play'])
    expect(request).toHaveBeenLastCalledWith(
      'tts.play',
      expect.objectContaining({ sourceId: expect.stringMatching(/^tts-preview:/) })
    )
  })

  it('never starts follow-up networking after the settings page unmounts', async () => {
    const { unmount } = render(<TtsSettingsPage />)
    await loaded()
    let resolveSave!: (value: TtsSettingsView) => void
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    fireEvent.click(screen.getByRole('button', { name: 'tts.settings.refresh_voices' }))
    unmount()
    resolveSave(view)
    await Promise.resolve()
    expect(request.mock.calls.map(([name]) => name)).toEqual(['tts.get_settings', 'tts.save_settings'])
  })

  it('shows sanitized failure feedback rather than a raw provider response', async () => {
    render(<TtsSettingsPage />)
    await loaded()
    request.mockRejectedValueOnce(new Error('raw server response containing secret'))
    fireEvent.click(screen.getByRole('button', { name: 'tts.settings.save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('tts.settings.save_error')
    expect(screen.queryByText(/raw server/)).not.toBeInTheDocument()
  })
})
