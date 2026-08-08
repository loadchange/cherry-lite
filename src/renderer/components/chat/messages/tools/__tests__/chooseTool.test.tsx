import type { NormalToolResponse } from '@renderer/types/mcpTool'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Stub the leaf cards so we can assert ONLY which branch chooseTool routes to.
vi.mock('../meta/MessageMetaTool', () => ({
  default: () => <div data-testid="meta-card" />,
  isMetaToolName: (name: string) => name === 'tool_search' || name === 'tool_inspect' || name === 'tool_invoke'
}))
vi.mock('../webSearch/MessageWebSearch', () => ({
  MessageWebSearchToolTitle: () => <div data-testid="web-card" />
}))
vi.mock('../agent', () => ({
  AgentExecutionTimeline: () => <div data-testid="agent-card" />
}))
// Empty enum → isAgentTool only matches the `mcp__` prefix, not our builtin names.
vi.mock('../shared/agentToolTypes', () => ({ AgentToolsType: {}, isAskUserQuestionToolName: () => false }))

const { chooseTool } = await import('../chooseTool')

function resp(name: string, type?: string): NormalToolResponse {
  return { tool: { name, type } } as unknown as NormalToolResponse
}

function testIdOf(node: React.ReactNode): string | null {
  const { container } = render(<>{node}</>)
  return container.querySelector('[data-testid]')?.getAttribute('data-testid') ?? null
}

describe('chooseTool', () => {
  it('renders short cherry-tool wire names without a bespoke card through the agent card', () => {
    expect(testIdOf(chooseTool(resp('web_fetch')))).toBe('agent-card')
    expect(testIdOf(chooseTool(resp('memory')))).toBe('agent-card')
  })

  it('routes the web_search wire name to its title card', () => {
    expect(testIdOf(chooseTool(resp('web_search')))).toBe('web-card')
  })

  it('routes provider-executed web search wire names to the web card', () => {
    expect(testIdOf(chooseTool(resp('web_search', 'provider')))).toBe('web-card')
    expect(testIdOf(chooseTool(resp('webSearch', 'provider')))).toBe('web-card')
  })
})
