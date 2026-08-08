import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConversationResourceView } from '../ConversationResourceView'

const { resourceCatalogViewMock } = vi.hoisted(() => ({
  resourceCatalogViewMock: vi.fn()
}))

vi.mock('@renderer/components/resourceCatalog/catalog', () => ({
  ResourceCatalogView: (props: { className?: string; resourceType: string }) => {
    resourceCatalogViewMock(props)

    return (
      <div className={props.className} data-resource-type={props.resourceType} data-testid="resource-catalog-view" />
    )
  }
}))

describe('ConversationResourceView', () => {
  beforeEach(() => {
    resourceCatalogViewMock.mockClear()
  })

  it('embeds the resource catalog for the conversation resource kind', () => {
    render(<ConversationResourceView kind="assistant" className="custom-shell" />)

    const view = screen.getByTestId('resource-catalog-view')
    expect(view).toHaveAttribute('data-resource-type', 'assistant')
    expect(resourceCatalogViewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'assistant',
        className: expect.stringContaining('custom-shell')
      })
    )
  })
})
