import '@testing-library/jest-dom/vitest'

import type { TtsHostCommand, TtsState } from '@shared/tts'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AudioHostApp from '../AudioHostApp'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  on: vi.fn(),
  dispose: vi.fn(),
  command: vi.fn(),
  create: vi.fn(),
  callbacks: new Map<string, (payload: unknown) => void>(),
  steps: [] as string[],
  unsubscribers: [] as ReturnType<typeof vi.fn>[]
}))
vi.mock('@renderer/ipc', () => ({ ipcApi: { request: mocks.request, on: mocks.on } }))
vi.mock('../AudioPlayback', () => ({
  AudioPlayback: class {
    constructor(dependencies: unknown) {
      mocks.create(dependencies)
    }
    command = mocks.command
    dispose = mocks.dispose
  }
}))
vi.mock('@renderer/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: PropsWithChildren) => children }))
vi.mock('@renderer/components/ThemeProvider', () => ({ ThemeProvider: ({ children }: PropsWithChildren) => children }))
vi.mock('@renderer/components/WindowFatalFallback', () => ({ WindowFatalFallback: () => null }))
vi.mock('@renderer/hooks/useLanguageSync', () => ({ useLanguageSync: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

describe('AudioHostApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.steps.length = 0
    mocks.callbacks.clear()
    mocks.unsubscribers.length = 0
    mocks.on.mockImplementation((name, callback) => {
      mocks.steps.push(name)
      mocks.callbacks.set(name, callback)
      const off = vi.fn(() => mocks.callbacks.delete(name))
      mocks.unsubscribers.push(off)
      return off
    })
    mocks.request.mockImplementation(async (name) => {
      mocks.steps.push(name)
      if (name === 'tts.get_state')
        return { status: 'playing', sessionId: 'session-1', segmentIndex: 0, segmentCount: 2 }
      return undefined
    })
  })

  it('subscribes before announcing readiness and owns one audio sink until unmount', async () => {
    const { unmount } = render(<AudioHostApp />)
    await screen.findByText('tts.playing · 1/2')
    expect(mocks.steps.slice(0, 3)).toEqual(['tts.host_command', 'tts.state', 'tts.host_ready'])
    const command: TtsHostCommand = { type: 'pause', sessionId: 'session-1' }
    act(() => mocks.callbacks.get('tts.host_command')?.(command))
    expect(mocks.command).toHaveBeenCalledWith(command)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0][0].audio).toBeInstanceOf(HTMLAudioElement)
    unmount()
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    expect(mocks.unsubscribers.every((off) => off.mock.calls.length === 1)).toBe(true)
  })

  it('sends session-scoped pause, resume and stop requests to the coordinator', async () => {
    render(<AudioHostApp />)
    await screen.findByText('tts.playing · 1/2')
    fireEvent.click(screen.getByRole('button', { name: 'tts.pause' }))
    expect(mocks.request).toHaveBeenLastCalledWith('tts.control', { action: 'pause', sessionId: 'session-1' })
    act(() => mocks.callbacks.get('tts.state')?.({ status: 'paused', sessionId: 'session-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'tts.resume' }))
    expect(mocks.request).toHaveBeenLastCalledWith('tts.control', { action: 'resume', sessionId: 'session-1' })
    fireEvent.click(screen.getByRole('button', { name: 'tts.stop' }))
    expect(mocks.request).toHaveBeenLastCalledWith('tts.control', { action: 'stop', sessionId: 'session-1' })
  })

  it('does not overwrite a live state event with a stale initial snapshot', async () => {
    let resolveState!: (state: TtsState) => void
    mocks.request.mockImplementation((name) =>
      name === 'tts.get_state'
        ? new Promise((resolve) => {
            resolveState = resolve
          })
        : Promise.resolve()
    )
    render(<AudioHostApp />)
    act(() => mocks.callbacks.get('tts.state')?.({ status: 'paused', sessionId: 'new-session' }))
    await act(async () => resolveState({ status: 'idle' }))
    expect(screen.getByText('tts.paused')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tts.resume' })).toBeEnabled()
  })

  it('reports only structured playback events and displays translated errors', async () => {
    render(<AudioHostApp />)
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    const event = { sessionId: 'session-1', index: 0, event: 'ended' }
    mocks.create.mock.calls[0][0].report(event)
    expect(mocks.request).toHaveBeenLastCalledWith('tts.host_event', event)
    act(() => mocks.callbacks.get('tts.state')?.({ status: 'error', error: 'Speech service unavailable' }))
    expect(screen.getByText('tts.error')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Speech service unavailable')
    expect(screen.queryByText('Speech service unavailable')).not.toBeInTheDocument()
    act(() =>
      mocks.callbacks.get('tts.state')?.({ status: 'error', errorCode: 'auth', error: 'Authentication failed' })
    )
    expect(screen.getByText('tts.errors.auth')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('title', 'tts.errors.auth')
  })

  it.each([
    ['network', 'network'],
    ['timeout', 'timeout'],
    ['auth', 'auth'],
    ['rate-limit', 'rate_limit'],
    ['invalid-config', 'invalid_config'],
    ['invalid-response', 'invalid_response'],
    ['too-large', 'too_large'],
    ['player', 'player']
  ])('shows a localized actionable message for %s failures', async (errorCode, key) => {
    render(<AudioHostApp />)
    await screen.findByText('tts.playing · 1/2')
    act(() => mocks.callbacks.get('tts.state')?.({ status: 'error', errorCode, error: 'English fallback' }))
    expect(screen.getByText(`tts.errors.${key}`)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('title', `tts.errors.${key}`)
    expect(screen.queryByText('English fallback')).not.toBeInTheDocument()
  })
})
