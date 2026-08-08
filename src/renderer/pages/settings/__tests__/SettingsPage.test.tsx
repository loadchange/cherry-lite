import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SettingsPage from '../SettingsPage'

const { isMacTransparentWindowMock, navigateMock } = vi.hoisted(() => ({
  isMacTransparentWindowMock: vi.fn(),
  navigateMock: vi.fn()
}))

vi.mock('@cherrystudio/ui', () => ({
  MenuDivider: () => <hr data-testid="menu-divider" />,
  MenuItem: ({ icon, label, onClick }: { icon?: ReactNode; label: string; onClick?: () => void }) => (
    <button type="button" data-testid="menu-item" onClick={onClick}>
      {icon}
      {label}
    </button>
  ),
  MenuList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageHeader: ({ className, title }: { className?: string; title: string }) => (
    <header className={className}>{title}</header>
  )
}))

vi.mock('@renderer/components/Scrollbar', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@renderer/hooks/useMacTransparentWindow', () => ({
  default: () => isMacTransparentWindowMock()
}))

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => null,
  useLocation: () => ({ pathname: '/settings/provider' }),
  useNavigate: () => navigateMock
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'agent.settings.toolsMcp.mcp.tab': 'MCP',
        'selection.name': '划词助手',
        'settings.dependencies.title': '环境依赖',
        'settings.menuGroups.automation': '效率',
        'settings.menuGroups.capabilities': '工具',
        'settings.menuGroups.personal': '偏好',
        'settings.menuGroups.quickAccess': '快捷入口',
        'settings.model': '默认模型',
        'settings.provider.title': '模型服务',
        'settings.quickAssistant.title': '快捷助手',
        'settings.shortcuts.title': '快捷键',
        'settings.system.title': '系统',
        'settings.tool.file_processing.features.image_to_text.title': 'OCR',
        'settings.tool.file_processing.features.document_to_markdown.title': '文档处理'
      })[key] ?? key
  })
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    isMacTransparentWindowMock.mockReturnValue(false)
    navigateMock.mockReset()
  })

  it('closes the model group with the default model and opens its settings page', () => {
    const { container } = render(<SettingsPage />)

    expect(container.querySelector('[data-ui="settings.view"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="settings.navigation"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="settings.content"]')).toBeInTheDocument()
    expect(screen.getByText('偏好')).toBeInTheDocument()

    const providerItem = screen.getByRole('button', { name: '模型服务' })
    const defaultModelItem = screen.getByRole('button', { name: '默认模型' })

    expect(providerItem.nextElementSibling).toBe(defaultModelItem)
    expect(defaultModelItem.nextElementSibling).toHaveAttribute('data-testid', 'menu-divider')
    fireEvent.click(defaultModelItem)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/model' })
  })

  it('keeps document processing and OCR together in tools and places dependencies below system', () => {
    render(<SettingsPage />)

    expect(screen.getByText('工具')).toBeInTheDocument()

    const documentProcessingItem = screen.getByRole('button', { name: '文档处理' })
    const ocrItem = screen.getByRole('button', { name: 'OCR' })
    expect(documentProcessingItem.nextElementSibling).toBe(ocrItem)
    expect(ocrItem.nextElementSibling).toHaveAttribute('data-testid', 'menu-divider')

    const systemItem = screen.getByRole('button', { name: '系统' })
    const dependenciesItem = screen.getByRole('button', { name: '环境依赖' })
    expect(systemItem.nextElementSibling).toBe(dependenciesItem)
    fireEvent.click(dependenciesItem)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/dependencies' })
  })

  it('places MCP first in tools and opens the MCP settings page', () => {
    render(<SettingsPage />)

    const mcpItem = screen.getByText('MCP').closest('button')
    const websearchItem = screen.getByRole('button', { name: 'settings.tool.websearch.title' })

    expect(mcpItem).not.toBeNull()
    expect(mcpItem?.nextElementSibling).toBe(websearchItem)
    fireEvent.click(mcpItem as HTMLElement)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/mcp' })
  })

  it('merges quick access into efficiency and places both assistants last', () => {
    render(<SettingsPage />)

    expect(screen.getByText('效率')).toBeInTheDocument()
    expect(screen.queryByText('快捷入口')).not.toBeInTheDocument()

    const efficiencyItems = ['快捷键', '快捷助手', '划词助手'].map((name) => screen.getByRole('button', { name }))
    const menuItems = screen.getAllByTestId('menu-item')
    const efficiencyStart = menuItems.indexOf(efficiencyItems[0])

    expect(menuItems.slice(efficiencyStart, efficiencyStart + efficiencyItems.length)).toEqual(efficiencyItems)
    expect(efficiencyItems.at(-1)?.nextElementSibling).toHaveAttribute('data-testid', 'menu-divider')
  })
})
