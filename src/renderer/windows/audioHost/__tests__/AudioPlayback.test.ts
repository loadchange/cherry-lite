import type { TtsHostCommand } from '@shared/tts'
import { describe, expect, it, vi } from 'vitest'

import { AudioPlayback } from '../AudioPlayback'

function setup() {
  const audio = {
    src: '',
    volume: 1,
    onplaying: null,
    onended: null,
    onerror: null,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
    removeAttribute: vi.fn()
  }
  let counter = 0
  const createUrl = vi.fn(() => `blob:audio-${++counter}`)
  const revokeUrl = vi.fn()
  const report = vi.fn()
  const playback = new AudioPlayback({ audio: audio as unknown as HTMLAudioElement, createUrl, revokeUrl, report })
  const trigger = (name: 'onplaying' | 'onended' | 'onerror') => {
    const callback = audio[name] as (() => void) | null
    callback?.()
  }
  return { playback, audio, createUrl, revokeUrl, report, trigger }
}

const segment = (index = 0, sessionId = 'session-1'): TtsHostCommand => ({
  type: 'segment',
  sessionId,
  index,
  audioBase64: btoa('audio'),
  mimeType: 'audio/mpeg',
  volume: 0.7
})

describe('AudioPlayback', () => {
  it('plays queued segments sequentially using one audio element and revokes every URL', () => {
    const { playback, audio, createUrl, revokeUrl, report, trigger } = setup()
    playback.command(segment())
    playback.command(segment(1))
    expect(audio.volume).toBe(0.7)
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(createUrl).toHaveBeenCalledTimes(1)
    trigger('onplaying')
    expect(report).toHaveBeenLastCalledWith({ sessionId: 'session-1', index: 0, event: 'playing' })
    trigger('onended')
    expect(report).toHaveBeenLastCalledWith({ sessionId: 'session-1', index: 0, event: 'ended' })
    expect(revokeUrl).toHaveBeenCalledWith('blob:audio-1')
    expect(audio.play).toHaveBeenCalledTimes(2)
    trigger('onended')
    expect(revokeUrl).toHaveBeenCalledWith('blob:audio-2')
    playback.dispose()
    expect(revokeUrl).toHaveBeenCalledTimes(2)
  })

  it('pauses and resumes without skipping the current segment', () => {
    const { playback, audio, report, trigger } = setup()
    playback.command(segment())
    playback.command({ type: 'pause', sessionId: 'session-1' })
    playback.command(segment(1))
    trigger('onplaying')
    expect(report).not.toHaveBeenCalled()
    expect(audio.play).toHaveBeenCalledTimes(1)
    playback.command({ type: 'resume', sessionId: 'session-1' })
    expect(audio.play).toHaveBeenCalledTimes(2)
    trigger('onplaying')
    expect(report).toHaveBeenLastCalledWith({ sessionId: 'session-1', index: 0, event: 'playing' })
  })

  it('ignores old controls, duplicate segments and late segments from stopped sessions', () => {
    const { playback, audio, revokeUrl } = setup()
    playback.command(segment())
    playback.command(segment())
    expect(audio.play).toHaveBeenCalledTimes(1)
    playback.command(segment(0, 'session-2'))
    expect(revokeUrl).toHaveBeenCalledWith('blob:audio-1')
    const pauses = audio.pause.mock.calls.length
    playback.command({ type: 'stop', sessionId: 'session-1' })
    playback.command(segment(2))
    expect(audio.pause).toHaveBeenCalledTimes(pauses)
    expect(audio.play).toHaveBeenCalledTimes(2)
    playback.command({ type: 'stop', sessionId: 'session-2' })
    playback.command(segment(1, 'session-2'))
    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(revokeUrl).toHaveBeenCalledWith('blob:audio-2')
  })

  it('does not let an old rejected play promise fail a replacement session', async () => {
    const { playback, audio, report } = setup()
    let rejectPlay!: (reason: Error) => void
    audio.play.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectPlay = reject
        })
    )
    playback.command(segment())
    playback.command(segment(0, 'session-2'))
    rejectPlay(new Error('aborted'))
    await Promise.resolve()
    expect(report).not.toHaveBeenCalled()
  })

  it('reports malformed audio once and clears the entire queue on playback error', () => {
    const { playback, report, revokeUrl, trigger } = setup()
    playback.command(segment())
    playback.command(segment(1))
    trigger('onerror')
    trigger('onerror')
    expect(report).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-1', index: 0, event: 'error' })
    expect(revokeUrl).toHaveBeenCalledTimes(1)
    playback.command({ ...segment(0, 'session-2'), type: 'segment', audioBase64: '!invalid!' } as TtsHostCommand)
    expect(report).toHaveBeenLastCalledWith({ sessionId: 'session-2', index: 0, event: 'error' })
  })

  it('ignores a pending play rejection caused by a pause followed immediately by resume', async () => {
    const { playback, audio, report } = setup()
    let rejectPlay!: (reason: Error) => void
    audio.play.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectPlay = reject
        })
    )
    playback.command(segment())
    playback.command({ type: 'pause', sessionId: 'session-1' })
    playback.command({ type: 'resume', sessionId: 'session-1' })
    rejectPlay(new Error('interrupted by pause'))
    await Promise.resolve()
    expect(report).not.toHaveBeenCalled()
  })

  it('disposes event handlers, queued audio and object URLs, rejecting future commands', () => {
    const { playback, audio, revokeUrl, report } = setup()
    playback.command(segment())
    playback.command(segment(1))
    const staleEnded = audio.onended as (() => void) | null
    playback.dispose()
    staleEnded?.()
    playback.command(segment(0, 'session-2'))
    expect(audio.onended).toBeNull()
    expect(audio.onplaying).toBeNull()
    expect(audio.onerror).toBeNull()
    expect(audio.removeAttribute).toHaveBeenCalledWith('src')
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:audio-1')
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(report).not.toHaveBeenCalled()
  })
})
