import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TranslateOutputPane from '../TranslateOutputPane'

const imageMocks = vi.hoisted(() => ({ capture: vi.fn(), copy: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@renderer/utils/image', () => ({
  captureScrollableAsDataUrl: imageMocks.capture,
  copyImageToClipboard: imageMocks.copy
}))
vi.mock('@renderer/services/toast', () => ({ toast: { success: imageMocks.success, error: imageMocks.error } }))

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn()
  },
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@renderer/utils/style', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')
}))

vi.mock('@cherrystudio/ui', () => ({
  Scrollbar: ({ children, ref, ...props }: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  ),
  NormalTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

const baseProps = () => ({
  translatedContent: '',
  renderedMarkdown: '',
  enableMarkdown: false,
  translating: false,
  copied: false,
  onCopy: vi.fn(),
  onScroll: vi.fn()
})

describe('TranslateOutputPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    imageMocks.capture.mockResolvedValue('data:image/png;base64,capture')
    imageMocks.copy.mockResolvedValue(undefined)
  })

  it('captures the full output element and writes it to the clipboard', async () => {
    render(<TranslateOutputPane {...baseProps()} translatedContent={'long output\n'.repeat(100)} />)
    fireEvent.click(screen.getByRole('button', { name: 'preview.copy.image' }))
    await waitFor(() => expect(imageMocks.copy).toHaveBeenCalledWith('data:image/png;base64,capture'))
    expect(imageMocks.capture.mock.calls[0][0].current.textContent).toBe('long output\n'.repeat(100))
    expect(imageMocks.success).toHaveBeenCalledOnce()
  })

  it('disables image capture while output is empty or streaming', () => {
    const { rerender } = render(<TranslateOutputPane {...baseProps()} />)
    expect(screen.getByRole('button', { name: 'preview.copy.image' })).toBeDisabled()
    rerender(<TranslateOutputPane {...baseProps()} translatedContent="partial" translating />)
    expect(screen.getByRole('button', { name: 'preview.copy.image' })).toBeDisabled()
  })

  it('reports a failed capture without writing an image', async () => {
    imageMocks.capture.mockRejectedValueOnce(new Error('capture failed'))
    render(<TranslateOutputPane {...baseProps()} translatedContent="output" />)
    fireEvent.click(screen.getByRole('button', { name: 'preview.copy.image' }))
    await waitFor(() => expect(imageMocks.error).toHaveBeenCalledWith('common.copy_failed'))
    expect(imageMocks.copy).not.toHaveBeenCalled()
  })

  it.each(['changed', 'unmounted'])('discards a stale capture after output is %s', async (state) => {
    let finishCapture!: (value: string) => void
    imageMocks.capture.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishCapture = resolve
        })
    )
    const { rerender, unmount } = render(<TranslateOutputPane {...baseProps()} translatedContent="old output" />)
    fireEvent.click(screen.getByRole('button', { name: 'preview.copy.image' }))
    await waitFor(() => expect(imageMocks.capture).toHaveBeenCalledOnce())
    if (state === 'changed') rerender(<TranslateOutputPane {...baseProps()} translatedContent="new output" />)
    else unmount()
    await act(async () => {
      finishCapture('data:image/png;base64,stale')
    })
    expect(imageMocks.copy).not.toHaveBeenCalled()
    expect(imageMocks.success).not.toHaveBeenCalled()
  })

  it('shows translated content, length, and a copy button', () => {
    const props = baseProps()
    props.translatedContent = 'partial output'

    render(<TranslateOutputPane {...props} />)

    expect(screen.getByText('partial output')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.copy' })).toBeEnabled()
  })

  it('shows the processing indicator while waiting for output', () => {
    const props = baseProps()
    props.translating = true

    render(<TranslateOutputPane {...props} />)

    expect(screen.getByText('translate.processing')).toBeInTheDocument()
  })
})
