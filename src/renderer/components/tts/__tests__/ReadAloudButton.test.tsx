import { getTtsMessageText } from '@renderer/hooks/useTts'
import type { CherryMessagePart } from '@shared/data/types/message'
import type { TtsState } from '@shared/tts'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ReadAloudButton from '../ReadAloudButton'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  on: vi.fn(),
  unsubscribe: vi.fn(),
  handler: undefined as undefined | ((state: TtsState) => void)
}))
vi.mock('@renderer/ipc', () => ({
  ipcApi: {
    request: mocks.request,
    on: mocks.on
  }
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

describe('ReadAloudButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.on.mockImplementation((_event, callback) => {
      mocks.handler = callback
      return mocks.unsubscribe
    })
    mocks.request.mockImplementation(async (route, input) => {
      if (route === 'tts.get_state') return { status: 'idle' }
      if (route === 'tts.play') return { status: 'playing', sourceId: input.sourceId, sessionId: 'session-1' }
      return undefined
    })
  })

  it('shares one state listener across buttons and sends the selected text and locale', async () => {
    const { unmount } = render(
      <>
        <ReadAloudButton sourceId="a" text="你好" locale="zh-cn" />
        <ReadAloudButton sourceId="b" text="Hello" />
      </>
    )
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('tts.get_state'))
    expect(mocks.on).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getAllByRole('button', { name: 'tts.read_aloud' })[0])
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith('tts.play', { sourceId: 'a', text: '你好', locale: 'zh-cn' })
    )
    await screen.findByRole('button', { name: 'tts.pause' })
    unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.request).toHaveBeenCalledWith('tts.control', { action: 'stop', sourceId: 'a' })
  })

  it('disables empty and streaming content without invoking play', async () => {
    render(
      <>
        <ReadAloudButton sourceId="a" text="  " />
        <ReadAloudButton sourceId="b" text="partial" disabled />
      </>
    )
    await act(async () => {
      await Promise.resolve()
    })
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled())
    expect(mocks.request.mock.calls.some(([route]) => route === 'tts.play')).toBe(false)
  })

  it('pauses, resumes and cancels only its own active session', async () => {
    render(<ReadAloudButton sourceId="a" text="Hello" />)
    await act(async () => {
      await Promise.resolve()
    })
    act(() => mocks.handler?.({ status: 'playing', sourceId: 'a', sessionId: 'session-a' }))
    fireEvent.click(screen.getByRole('button', { name: 'tts.pause' }))
    expect(mocks.request).toHaveBeenCalledWith('tts.control', {
      action: 'pause',
      sourceId: 'a',
      sessionId: 'session-a'
    })
    act(() => mocks.handler?.({ status: 'paused', sourceId: 'a', sessionId: 'session-a' }))
    fireEvent.click(screen.getByRole('button', { name: 'tts.resume' }))
    expect(mocks.request).toHaveBeenCalledWith('tts.control', {
      action: 'resume',
      sourceId: 'a',
      sessionId: 'session-a'
    })
    act(() => mocks.handler?.({ status: 'preparing', sourceId: 'a', sessionId: 'session-a' }))
    fireEvent.click(screen.getByRole('button', { name: 'tts.stop' }))
    expect(mocks.request).toHaveBeenCalledWith('tts.control', { action: 'stop', sourceId: 'a', sessionId: 'session-a' })
  })

  it('does not stop playback owned by another source when unmounted', async () => {
    const { unmount } = render(<ReadAloudButton sourceId="a" text="Hello" />)
    await act(async () => {
      await Promise.resolve()
    })
    act(() => mocks.handler?.({ status: 'playing', sourceId: 'another-window', sessionId: 'session-b' }))
    mocks.request.mockClear()
    unmount()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('stops old content on source changes but lets a selection toolbar continue after hiding', async () => {
    const { rerender, unmount } = render(<ReadAloudButton sourceId="translation:old" text="Old" />)
    await act(async () => {
      await Promise.resolve()
    })
    act(() => mocks.handler?.({ status: 'playing', sourceId: 'translation:old' }))
    rerender(<ReadAloudButton sourceId="selection:new" text="New" stopOnUnmount={false} />)
    expect(mocks.request).toHaveBeenCalledWith('tts.control', { action: 'stop', sourceId: 'translation:old' })
    act(() => mocks.handler?.({ status: 'playing', sourceId: 'selection:new' }))
    mocks.request.mockClear()
    unmount()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('ignores an initial state response that arrives after a newer playback event', async () => {
    let resolveState: (state: TtsState) => void = () => undefined
    mocks.request.mockImplementationOnce(
      () =>
        new Promise<TtsState>((resolve) => {
          resolveState = resolve
        })
    )
    render(<ReadAloudButton sourceId="latest" text="Hello" />)
    act(() => mocks.handler?.({ status: 'playing', sourceId: 'latest', sessionId: 'new-session' }))
    await act(async () => {
      resolveState({ status: 'idle' })
    })
    expect(screen.getByRole('button', { name: 'tts.pause' })).toBeInTheDocument()
  })

  it('reads only text parts, leaving reasoning and tool output out', () => {
    expect(
      getTtsMessageText([
        { type: 'text', text: 'First paragraph' },
        { type: 'reasoning', text: 'Private reasoning' },
        { type: 'tool-search', output: 'Tool result' },
        { type: 'data-translation', data: { text: 'Translation' } },
        { type: 'text', text: 'Last paragraph' }
      ] as CherryMessagePart[])
    ).toBe('First paragraph\n\nLast paragraph')
  })
})
