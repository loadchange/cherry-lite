import { MockUsePreferenceUtils } from '@test-mocks/renderer/usePreference'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSidebarFavorites } from '../useSidebarFavorites'

describe('useSidebarFavorites', () => {
  beforeEach(() => {
    MockUsePreferenceUtils.resetMocks()
  })

  it('should append a pinned app to the stored favorites', () => {
    const setFavorites = vi.fn().mockResolvedValue(undefined)
    MockUsePreferenceUtils.mockPreferenceReturn(
      'ui.sidebar.favorites',
      [{ type: 'app', id: 'assistants' }],
      setFavorites
    )

    const { result } = renderHook(() => useSidebarFavorites())

    act(() => {
      result.current.setAppPinned('translate', true)
    })

    expect(setFavorites).toHaveBeenCalledWith([
      { type: 'app', id: 'assistants' },
      { type: 'app', id: 'translate' }
    ])
  })

  it('should keep a required app pinned when unpinning it', () => {
    const setFavorites = vi.fn().mockResolvedValue(undefined)
    MockUsePreferenceUtils.mockPreferenceReturn(
      'ui.sidebar.favorites',
      [{ type: 'app', id: 'assistants' }],
      setFavorites
    )

    const { result } = renderHook(() => useSidebarFavorites())

    act(() => {
      result.current.setAppPinned('assistants', false)
    })

    expect(setFavorites).toHaveBeenCalledWith([{ type: 'app', id: 'assistants' }])
  })
})
