import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import SelectionToolbarView from '../SelectionToolbarView'

vi.mock('@renderer/assets/images/logo.png', () => ({ default: 'logo.png' }))

describe('SelectionToolbarView surface', () => {
  it('keeps the read-aloud preview beside all eight configured actions', () => {
    const actions = Array.from({ length: 8 }, (_, index) => ({
      id: `action-${index}`,
      name: `Action ${index}`,
      enabled: true,
      isBuiltIn: false
    }))
    render(
      <SelectionToolbarView
        actionItems={actions}
        isCompact={false}
        handleAction={vi.fn()}
        copyIconStatus="normal"
        copyIconAnimation="none"
      />
    )
    expect(screen.getAllByRole('button')).toHaveLength(9)
    expect(screen.getByRole('button', { name: 'Action 7' })).toBeInTheDocument()
  })

  it('uses an opaque card as the default toolbar background', () => {
    const { container } = render(
      <SelectionToolbarView
        actionItems={[]}
        isCompact={false}
        handleAction={vi.fn()}
        copyIconStatus="normal"
        copyIconAnimation="none"
      />
    )

    expect(container.firstElementChild?.className).toContain('bg-card')
    expect(container.firstElementChild?.className).not.toContain('rgb(245_245_245_/_0.95)')
    expect(container.firstElementChild?.className).not.toContain('rgb(20_20_20_/_0.95)')
  })
})
