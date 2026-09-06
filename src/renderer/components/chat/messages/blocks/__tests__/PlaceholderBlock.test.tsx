import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PlaceholderBlock, { formatPlaceholderElapsed, usePlaceholderElapsedMs } from '../PlaceholderBlock'

const translations: Record<string, string> = {
  'message.tools.placeholder.elapsed.days': '{{days}} days {{hours}} hours {{minutes}} minutes {{seconds}} seconds',
  'message.tools.placeholder.elapsed.hours': '{{hours}} hours {{minutes}} minutes {{seconds}} seconds',
  'message.tools.placeholder.elapsed.minutes': '{{minutes}} minutes {{seconds}} seconds',
  'message.tools.placeholder.elapsed.seconds': '{{seconds}} seconds',
  'message.tools.placeholder.generating': 'Generating response',
  'message.tools.placeholder.preparing': 'Preparing response',
  'message.tools.placeholder.thinking': 'Thinking',
  'message.tools.placeholder.usingTools': 'Working with tools'
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number | string>) => {
      const template = translations[key] ?? key
      if (!options) return template
      return Object.entries(options).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
        template
      )
    }
  })
}))

vi.mock('react-spinners', () => ({
  BeatLoader: () => <span data-testid="beat-loader" />
}))

describe('PlaceholderBlock', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the processing stage with a beat loader and no elapsed time', () => {
    const { container } = render(<PlaceholderBlock isProcessing createdAt={new Date().toISOString()} />)

    expect(screen.getByTestId('message-status-placeholder')).toBeInTheDocument()
    expect(screen.getByTestId('message-status-text')).toHaveTextContent('Preparing response')
    expect(screen.getByTestId('beat-loader')).toBeInTheDocument()
    expect(screen.queryByTestId('message-status-elapsed')).not.toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('shows the requested generation stage', () => {
    render(<PlaceholderBlock isProcessing createdAt={new Date().toISOString()} status="thinking" />)

    expect(screen.getByTestId('message-status-text')).toHaveTextContent('Thinking')
  })

  it('formats elapsed time across seconds, minutes, hours, and days', () => {
    const t = (key: string, options?: Record<string, number | string>) => {
      const template = translations[key] ?? key
      if (!options) return template
      return Object.entries(options).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
        template
      )
    }

    expect(formatPlaceholderElapsed(9_123, t)).toBe('9 seconds')
    expect(formatPlaceholderElapsed(65_456, t)).toBe('1 minutes 5 seconds')
    expect(formatPlaceholderElapsed(3_665_789, t)).toBe('1 hours 1 minutes 6 seconds')
    expect(formatPlaceholderElapsed(90_065_987, t)).toBe('1 days 1 hours 1 minutes 6 seconds')
  })

  it('catches up immediately when a background tab becomes visible and cleans up the listener', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const createdAt = new Date().toISOString()
    const { result, unmount } = renderHook(() => usePlaceholderElapsedMs(true, createdAt, 1000))
    expect(result.current).toBe(0)

    act(() => {
      vi.setSystemTime(new Date('2026-01-01T00:00:30Z'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(30_000)

    unmount()
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    removeListener.mockRestore()
    visibility.mockRestore()
  })

  it('renders nothing when the message is not processing', () => {
    const { container } = render(<PlaceholderBlock isProcessing={false} createdAt={new Date().toISOString()} />)

    expect(container).toBeEmptyDOMElement()
  })
})
