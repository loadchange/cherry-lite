import type * as CherryStudioUi from '@cherrystudio/ui'
import { toast } from '@renderer/services/toast'
import type { Assistant } from '@shared/data/types/assistant'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import type * as ReactI18next from 'react-i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createGroupMock,
  fetchGenerateMock,
  installedSkillsState,
  ipcRequestMock,
  mcpStatusState,
  openSettingsTabMock,
  settingsNavigateMock,
  skillCatalogPickerMock,
  updateAssistantMock,
  useMutationMock,
  useQueryMock
} = vi.hoisted(() => ({
  createGroupMock: vi.fn(),
  fetchGenerateMock: vi.fn(),
  installedSkillsState: {
    current: {
      skills: [
        {
          id: 'skill-1',
          name: 'Skill One',
          description: 'Skill description',
          isEnabled: false
        }
      ],
      loading: false,
      refreshing: false
    }
  },
  ipcRequestMock: vi.fn(),
  mcpStatusState: { current: {} as Record<string, { state: string; lastCheckedAt: number }> },
  openSettingsTabMock: vi.fn(),
  settingsNavigateMock: vi.fn(),
  skillCatalogPickerMock: vi.fn(),
  updateAssistantMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn()
}))

const MODEL = vi.hoisted(
  () =>
    ({
      id: 'provider::updated-model',
      providerId: 'provider',
      name: 'Updated Model',
      capabilities: [],
      supportsStreaming: true,
      isEnabled: true,
      isHidden: false
    }) as const
)

vi.mock('@renderer/components/ModelSelector', () => ({
  ModelSelector: ({
    trigger,
    onSelect,
    onSettingsNavigate
  }: {
    trigger: ReactNode
    onSelect: (modelId: string | undefined) => void
    onSettingsNavigate?: (navigate: () => void) => void
  }) => (
    <div>
      {trigger}
      <button type="button" onClick={() => onSelect(MODEL.id)}>
        Pick model
      </button>
      <button type="button" onClick={() => onSettingsNavigate?.(settingsNavigateMock)}>
        Open model settings
      </button>
    </div>
  )
}))

vi.mock('@cherrystudio/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof CherryStudioUi>()
  return actual
})

vi.mock('@renderer/components/EmojiPicker', () => ({
  EmojiPicker: ({ onEmojiClick }: { onEmojiClick: (emoji: string) => void }) => (
    <button type="button" onClick={() => onEmojiClick('🎓')}>
      Choose emoji
    </button>
  )
}))

vi.mock('@renderer/components/PromptEditorField', () => ({
  default: ({
    actions,
    label,
    labelAddon,
    value,
    onChange,
    placeholder,
    resetPreviewKey,
    minHeight,
    maxHeight
  }: {
    actions?: ReactNode
    label?: ReactNode
    labelAddon?: ReactNode
    value: string
    onChange: (value: string) => void
    placeholder?: string
    resetPreviewKey?: number
    minHeight?: string
    maxHeight?: string
  }) => (
    <div>
      <div>
        {label}
        {labelAddon}
        {actions}
      </div>
      <textarea
        aria-label="Prompt editor"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ minHeight, maxHeight }}
      />
      <output data-testid="prompt-preview-reset-key">{resetPreviewKey}</output>
    </div>
  )
}))

vi.mock('@renderer/components/resourceCatalog/dialogs/skill', () => ({
  SkillCatalogPicker: (props: {
    mode: 'create' | 'edit'
    skills: Array<{ id: string; name: string }>
    loading: boolean
    selectedIds: readonly string[]
    disabled?: boolean
    onSelectedIdsChange: (ids: string[]) => void
    trailingItem?: ReactNode
  }) => {
    skillCatalogPickerMock(props)

    return (
      <div data-testid="skill-catalog-picker" data-mode={props.mode} className="grid sm:grid-cols-2">
        {props.loading
          ? null
          : props.skills.map((skill) => {
              const selected = props.selectedIds.includes(skill.id)
              return (
                <button
                  key={skill.id}
                  type="button"
                  role="switch"
                  aria-checked={selected}
                  disabled={props.disabled}
                  onClick={() =>
                    props.onSelectedIdsChange(
                      selected
                        ? props.selectedIds.filter((selectedId) => selectedId !== skill.id)
                        : [...props.selectedIds, skill.id]
                    )
                  }>
                  {skill.name}
                </button>
              )
            })}
        {props.trailingItem}
      </div>
    )
  }
}))

vi.mock('@renderer/hooks/useGroups', () => ({
  useGroups: () => ({
    groups: [
      {
        id: 'group-work',
        entityType: 'assistant',
        name: 'work',
        orderKey: 'a0',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      },
      {
        id: 'group-personal',
        entityType: 'assistant',
        name: 'personal',
        orderKey: 'a1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    ]
  }),
  useGroupMutations: () => ({
    createGroup: createGroupMock
  })
}))

vi.mock('@renderer/data/hooks/useDataApi', () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock
}))

vi.mock('@renderer/hooks/useMcpRuntimeStatus', () => ({
  useMcpRuntimeStatusMap: () => mcpStatusState.current
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: ipcRequestMock }
}))

vi.mock('@renderer/hooks/useSkills', () => ({
  useReconcileSkillsOnOpen: vi.fn(),
  useInstalledSkills: () => ({
    ...installedSkillsState.current,
    refresh: vi.fn()
  })
}))

vi.mock('@renderer/hooks/usePromptProcessor', () => ({
  usePromptProcessor: ({ prompt }: { prompt: string }) => prompt
}))

vi.mock('@renderer/utils/aiGeneration', () => ({
  fetchGenerate: fetchGenerateMock
}))

vi.mock('@renderer/services/mainWindowNavigation', () => ({
  openSettingsTab: openSettingsTabMock
}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactI18next>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: string) =>
        ({
          'agent.settings.tooling.preapproved.autoBadge': 'Added by mode',
          'agent.settings.tooling.preapproved.autoDisabledTooltip': 'Added by {{mode}}',
          // Permission-mode titles intentionally absent: they fall through to the card
          // definitions' own fallbacks, so copy changes need no edit here.
          'agent.settings.skills.addMore': 'Manage Skills',
          'common.avatar': 'Avatar',
          'common.add': 'Add',
          'common.cancel': 'Cancel',
          'common.clear': 'Clear',
          'common.close': 'Close',
          'common.delete': 'Delete',
          'common.description': 'Description',
          'common.edit': 'Edit',
          'common.help': 'Help',
          'common.group.create': 'New Group',
          'common.group.create_failed': 'Failed to create group',
          'common.group.name_placeholder': 'Enter group name...',
          'common.group.name_required': 'Group name is required',
          'common.loading': 'Loading',
          'common.model': 'Model',
          'common.name': 'Name',
          'common.preview': 'Preview',
          'common.remove': 'Remove',
          'common.required_field': 'Required',
          'common.save': 'Save',
          'common.undo': 'Undo',
          'error.no_response': 'No response',
          'library.action.enable': 'Enable',
          'library.config.agent.field.description.hint': 'Short agent summary.',
          'library.config.agent.field.description.label': 'Description',
          'library.config.agent.field.description.placeholder': 'Describe this agent',
          'library.config.agent.field.heartbeat_enabled.label': 'Heartbeat',
          'library.config.agent.field.heartbeat_interval.label': 'Heartbeat interval',
          'library.config.agent.field.model.hint': 'Primary agent model.',
          'library.config.agent.field.model.label': 'Model',
          'library.config.agent.field.name.hint': 'Shown in the selector.',
          'library.config.agent.field.name.label': 'Name',
          'library.config.agent.field.name.placeholder': 'Name this agent',
          'library.config.agent.field.plan_model.hint': 'Plan model.',
          'library.config.agent.field.plan_model.label': 'Plan model',
          'library.config.agent.field.small_model.hint': 'Small model.',
          'library.config.agent.field.small_model.label': 'Small model',
          'library.config.agent.field.instructions.label': 'Instructions',
          'library.config.agent.field.instructions.placeholder': 'Tell this agent how to work',
          'library.config.agent.field.env_vars.help': 'One KEY=VALUE per line',
          'library.config.agent.field.env_vars.label': 'Environment variables',
          'library.config.agent.field.env_vars.placeholder': 'KEY=value\nANOTHER_KEY=another_value',
          'library.config.agent.field.permission_mode.label': 'Permission mode',
          'library.config.agent.section.permission.desc': 'Permission options.',
          'library.config.agent.section.permission.title': 'Permission',
          'library.config.agent.section.tools.add': 'Add',
          'library.config.agent.section.tools.no_builtin_enabled': 'No built-in tools enabled',
          'library.config.agent.section.tools.no_mcp_bound': 'No MCP servers bound',
          'library.config.agent.section.tools.no_skills_enabled': 'No skills enabled',
          'library.config.agent.section.tools.search_placeholder': 'Search tools',
          'library.config.agent.section.tools.skills_require_save': 'Save before skills',
          'library.config.agent.section.tools.tab.mcp': 'MCP',
          'library.config.agent.section.tools.tab.skills': '技能',
          'library.config.agent.section.tools.tab.tools': 'Built-in tools',
          'library.config.agent.model_config': 'Model',
          'library.config.basic.field.description.hint': 'Short assistant summary.',
          'library.config.basic.field.description.placeholder': 'Describe this assistant',
          'library.config.basic.custom_params': 'Custom parameters',
          'library.config.basic.custom_params_add': 'Add parameter',
          'library.config.basic.custom_params_name': 'Parameter name',
          'library.config.basic.default_value': 'Model default',
          'library.config.basic.field.model.hint': 'Default chat model.',
          'library.config.basic.field.name.hint': 'Shown in the selector.',
          'library.config.basic.field.name.placeholder': 'Name this assistant',
          'library.config.basic.field.tags.hint': 'Group related assistants.',
          'library.config.basic.field.custom_params.hint': 'Extra provider parameters.',
          'library.config.basic.field.max_tokens.hint': 'Caps response length.',
          'library.config.basic.field.max_tool_calls.hint': 'Caps tool-call rounds at 100.',
          'library.config.basic.field.stream_output.hint': 'Stream responses.',
          'library.config.basic.field.temperature.hint': 'Controls randomness.',
          'library.config.basic.field.top_p.hint': 'Controls nucleus sampling.',
          'library.config.basic.creative': 'Creative',
          'library.config.basic.json_invalid': 'Invalid JSON',
          'library.config.basic.max_tokens': 'Max tokens',
          'library.config.basic.max_tool_calls': 'Max tool call rounds',
          'library.config.basic.max_tool_calls_default': 'Default (20 rounds)',
          'library.config.basic.model_clear': 'Clear',
          'library.config.basic.model_pick': 'Pick model',
          'library.config.basic.model_not_found': 'Model {{id}} is unavailable.',
          'library.config.basic.precise': 'Precise',
          'library.config.basic.stream_output': 'Stream output',
          'library.config.basic.group': 'Group',
          'library.config.basic.group_empty': 'No groups',
          'library.config.basic.group_placeholder': 'Select group',
          'library.config.basic.tags': 'Tags',
          'library.config.basic.tag_empty': 'No tags',
          'library.config.basic.tag_placeholder': 'Select tag',
          'library.config.basic.tag_search': 'Search tags',
          'library.config.basic.mcp_mode': 'MCP Mode',
          'library.config.basic.temperature': 'Temperature',
          'library.config.basic.top_p': 'Top-P',
          'library.config.dialogs.edit.advanced_tab': 'Advanced',
          'library.config.prompt.label': 'Prompt',
          'library.config.prompt.placeholder': 'Tell this assistant how to respond',
          'library.config.prompt.dblclick_hint': 'Double-click to edit',
          'library.config.prompt.generate': 'Generate prompt',
          'library.config.prompt.generate_failed_description': 'Check or change the default model, then try again.',
          'library.config.prompt.generate_failed_title': 'Failed to generate prompt',
          'library.config.prompt.polish': 'Polish prompt',
          'library.config.prompt.polish_failed_description': 'Check or change the default model, then try again.',
          'library.config.prompt.polish_failed_title': 'Failed to polish prompt',
          'library.config.prompt.polish_variables_changed_description': 'Prompt variables changed.',
          'library.config.prompt.polish_variables_changed_title': 'Could not apply polished prompt',
          'library.config.prompt.tokens_label': 'Tokens: ',
          'library.config.prompt.variables_description':
            'Insert these system variables into the system prompt; before each assistant reply, they are filled with the current information.',
          'library.config.prompt.variables_example': 'Example: Today is {{date}}, and the current date is used.',
          'library.config.prompt.variables_title': 'System variables',
          'library.config.prompt.vars.arch': 'Architecture',
          'library.config.prompt.vars.date': 'Date',
          'library.config.prompt.vars.datetime': 'Datetime',
          'library.config.prompt.vars.language': 'Language',
          'library.config.prompt.vars.model_name': 'Model name',
          'library.config.prompt.vars.os': 'OS',
          'library.config.prompt.vars.time': 'Time',
          'library.config.prompt.vars.username': 'Username',
          'library.config.dialogs.create.avatar_aria': 'Pick avatar',
          'library.config.dialogs.edit.agent_description': 'Edit the essentials for this agent.',
          'library.config.dialogs.edit.agent_title': 'Edit Agent',
          'library.config.dialogs.edit.assistant_description': 'Edit the essentials for this assistant.',
          'library.config.dialogs.edit.assistant_title': 'Edit Assistant',
          'library.config.dialogs.edit.basic_tab': 'Basic',
          'library.config.dialogs.edit.permission_tab': 'Permission',
          'library.config.dialogs.edit.prompt_tab': 'Prompt',
          'library.config.dialogs.edit.save_failed': 'Save failed',
          'library.config.dialogs.edit.tools_tab': 'Tools',
          'library.config.tools.add_mcp': 'Add MCP server',
          'library.config.tools.added': 'MCP services',
          'library.config.tools.added_hint': 'Manual mode only uses these.',
          'library.config.tools.empty_desc': 'No MCP description',
          'library.config.tools.empty_title': 'No MCP servers added',
          'library.config.tools.inactive_badge': 'Inactive',
          'library.config.tools.info_main': 'MCP info.',
          'library.config.tools.info_sub': 'MCP sub info.',
          'library.config.tools.mode.auto.desc': 'Auto desc',
          'library.config.tools.mode.auto.label': 'Auto',
          'library.config.tools.mode.disabled.desc': 'Disabled desc',
          'library.config.tools.mode.disabled.label': 'Disabled',
          'library.config.tools.mode.manual.desc': 'Manual desc',
          'library.config.tools.mode.manual.label': 'Manual',
          'library.config.tools.no_more': 'No more servers',
          'library.config.tools.search': 'Search servers',
          'library.no_match': 'No match',
          'settings.mcp.runtimeStatus.connected': 'Connected',
          'settings.mcp.runtimeStatus.connecting': 'Connecting',
          'settings.mcp.runtimeStatus.unavailable': 'Unavailable',
          'settings.title': 'Settings'
        })[key] ??
        fallback ??
        key
    })
  }
})

import { AssistantEditDialog } from '../AssistantEditDialog'

const ASSISTANT: Assistant = {
  id: 'assistant-1',
  name: 'Alpha Assistant',
  prompt: 'Original prompt',
  emoji: '💬',
  description: 'Original assistant description',
  settings: {
    temperature: 1,
    enableTemperature: false,
    topP: 1,
    enableTopP: false,
    maxTokens: 4096,
    enableMaxTokens: false,
    streamOutput: true,
    reasoning_effort: 'default',
    mcpMode: 'auto',
    maxToolCalls: 20,
    enableMaxToolCalls: true,
    enableWebSearch: false,
    enableGenerateImage: false,
    customParameters: []
  },
  modelId: 'provider::old-model',
  orderKey: 'a0',
  mcpServerIds: [],
  groupId: 'group-work',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  modelName: 'Old Model'
}

beforeAll(() => {
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {}
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => {}
  }
  HTMLElement.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
  installedSkillsState.current = {
    skills: [
      {
        id: 'skill-1',
        name: 'Skill One',
        description: 'Skill description',
        isEnabled: false
      }
    ],
    loading: false,
    refreshing: false
  }
  mcpStatusState.current = {
    'mcp-1': { state: 'connected', lastCheckedAt: 1 }
  }
  useQueryMock.mockImplementation((path: string) => {
    if (path.startsWith('/models/')) {
      const id = path.slice('/models/'.length)
      return {
        data: {
          ...MODEL,
          id,
          name: id === MODEL.id ? MODEL.name : 'Old Model'
        },
        isLoading: false
      }
    }
    if (path === '/providers/:providerId') {
      return {
        data: { id: 'provider', name: 'Provider' },
        isLoading: false
      }
    }
    if (path === '/mcp-servers') {
      return {
        data: {
          items: [
            {
              id: 'mcp-1',
              name: 'MCP One',
              description: 'MCP description',
              isActive: true
            }
          ]
        },
        isLoading: false
      }
    }
    return { data: { items: [] }, isLoading: false }
  })
  useMutationMock.mockImplementation((method: string, path: string) => {
    if (method === 'PATCH' && path.startsWith('/assistants/')) {
      return { trigger: updateAssistantMock, isLoading: false, error: undefined }
    }
    return { trigger: vi.fn(), isLoading: false, error: undefined }
  })
  updateAssistantMock.mockResolvedValue({ ...ASSISTANT, name: 'Updated Assistant' })
  createGroupMock.mockResolvedValue({
    id: 'group-created',
    entityType: 'assistant',
    name: 'created',
    orderKey: 'a2',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  })
  fetchGenerateMock.mockResolvedValue('Generated prompt')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function selectTab(name: string) {
  const tab = screen.getByRole('tab', { name })
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false })
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false })
  fireEvent.click(tab)
  fireEvent.keyDown(tab, { key: 'Enter', code: 'Enter' })
}

async function expectVariablesHelpOnOpen() {
  const trigger = screen.getByRole('button', { name: 'System variables' })
  fireEvent.click(trigger)
  await waitFor(() => {
    expect(
      screen.getAllByText(
        'Insert these system variables into the system prompt; before each assistant reply, they are filled with the current information.'
      )
    ).not.toHaveLength(0)
  })
  expect(screen.getAllByText('Example: Today is {{date}}, and the current date is used.')).not.toHaveLength(0)
  await waitFor(() => expect(screen.getAllByText('{{date}}').length).toBeGreaterThan(0))
}

function openGroupSelect() {
  const select = screen.getByRole('combobox', { name: 'Group' })
  fireEvent.pointerDown(select)
  fireEvent.click(select)
}

function mockDeferredAnimationFrames() {
  const callbacks: FrameRequestCallback[] = []
  const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.push(callback)
    return callbacks.length
  })
  const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

  return {
    pendingCount: () => callbacks.length,
    flushAllFrames: () => {
      while (callbacks.length > 0) {
        const pendingCallbacks = callbacks.splice(0)
        act(() => {
          for (const callback of pendingCallbacks) {
            callback(0)
          }
        })
      }
    },
    restore: () => {
      requestAnimationFrameSpy.mockRestore()
      cancelAnimationFrameSpy.mockRestore()
    }
  }
}

describe('edit dialogs', () => {
  it('submits assistant name, description, and model changes as a PATCH', async () => {
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated Assistant' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated assistant description' } })
    const modelTrigger = screen.getByRole('button', { name: 'Model' })
    expect(modelTrigger).toHaveTextContent('Old Model')
    expect(modelTrigger).not.toHaveTextContent('Provider')
    fireEvent.click(modelTrigger)
    fireEvent.click(screen.getByRole('button', { name: 'Pick model' }))
    await waitFor(() =>
      expect(updateAssistantMock).toHaveBeenCalledWith({
        body: expect.objectContaining({
          name: 'Updated Assistant',
          description: 'Updated assistant description',
          modelId: MODEL.id
        })
      })
    )
  })

  it('shows the clear model affordance beside the chevron and clears the selected model', async () => {
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} />)

    const modelTrigger = screen.getByRole('button', { name: 'Model' })
    const clearButton = screen.getByRole('button', { name: 'Model Clear' })

    expect(modelTrigger).toBeInTheDocument()

    fireEvent.click(clearButton)
    await waitFor(() =>
      expect(updateAssistantMock).toHaveBeenCalledWith({
        body: expect.objectContaining({
          modelId: null
        })
      })
    )
  })

  it('submits assistant group changes directly', async () => {
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} />)

    openGroupSelect()
    fireEvent.click(await screen.findByRole('option', { name: 'personal' }))
    await waitFor(() =>
      expect(updateAssistantMock).toHaveBeenCalledWith({
        body: expect.objectContaining({
          groupId: 'group-personal'
        })
      })
    )
  })

  it('creates and selects an assistant group from the group field', async () => {
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} />)

    openGroupSelect()
    fireEvent.click(await screen.findByRole('option', { name: 'New Group' }))

    const createDialog = screen.getByRole('dialog', { name: 'New Group' })
    fireEvent.change(within(createDialog).getByLabelText('Name'), { target: { value: '  created  ' } })
    fireEvent.click(within(createDialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(createGroupMock).toHaveBeenCalledWith('created'))
    await waitFor(() =>
      expect(updateAssistantMock).toHaveBeenCalledWith({
        body: expect.objectContaining({
          groupId: 'group-created'
        })
      })
    )
  })

  it('clears the assistant group from the single-select group field', async () => {
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} />)

    const clearButton = screen.getByRole('button', { name: 'Group Clear' })
    fireEvent.click(clearButton)
    await waitFor(() =>
      expect(updateAssistantMock).toHaveBeenCalledWith({
        body: expect.objectContaining({
          groupId: null
        })
      })
    )
  })

  it('keeps assistant grouping single-select while exposing the shared create action', async () => {
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} />)

    openGroupSelect()
    expect(screen.queryByPlaceholderText('Search groups')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'No group' })).not.toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'New Group' })).toBeInTheDocument()
  })

  it('closes the group selector without closing the assistant edit dialog when clicking elsewhere inside it', async () => {
    const onOpenChange = vi.fn()
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)

    openGroupSelect()
    await screen.findByRole('option', { name: 'personal' })
    fireEvent.pointerDown(screen.getByLabelText('Name'))
    fireEvent.click(screen.getByLabelText('Name'))

    await waitFor(() => expect(screen.queryByRole('option', { name: 'personal' })).not.toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('shows the default tool-call cap and clamps custom rounds at 100', async () => {
    render(
      <AssistantEditDialog
        open
        resource={{
          ...ASSISTANT,
          settings: {
            ...ASSISTANT.settings,
            enableMaxToolCalls: false
          }
        }}
        onOpenChange={vi.fn()}
      />
    )

    selectTab('Model')
    const maxToolCallsSwitch = await screen.findByRole('switch', { name: 'Max tool call rounds' })

    expect(maxToolCallsSwitch).not.toBeChecked()
    expect(screen.getByText('Default (20 rounds)')).toBeVisible()

    fireEvent.click(maxToolCallsSwitch)
    const maxToolCallsInput = await screen.findByDisplayValue('20')
    expect(maxToolCallsInput).toHaveAttribute('min', '1')
    expect(maxToolCallsInput).toHaveAttribute('max', '100')

    fireEvent.focus(maxToolCallsInput)
    fireEvent.change(maxToolCallsInput, { target: { value: '101' } })
    fireEvent.blur(maxToolCallsInput)

    expect(maxToolCallsInput).toHaveValue(100)
    await waitFor(() =>
      expect(updateAssistantMock).toHaveBeenCalledWith({
        body: expect.objectContaining({
          settings: expect.objectContaining({
            enableMaxToolCalls: true,
            maxToolCalls: 100
          })
        })
      })
    )
  })

  it('polishes and restores assistant prompts through the shared action', async () => {
    fetchGenerateMock.mockResolvedValueOnce('Polished assistant prompt')
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} />)

    selectTab('Prompt')
    await expectVariablesHelpOnOpen()
    const polishButton = screen.getByRole('button', { name: 'Polish prompt' })
    expect(screen.getByTestId('prompt-preview-reset-key')).toHaveTextContent('0')
    fireEvent.click(polishButton)

    await waitFor(() => expect(screen.getByLabelText('Prompt editor')).toHaveValue('Polished assistant prompt'))
    expect(fetchGenerateMock).toHaveBeenCalledWith({
      prompt: expect.stringContaining('Improve the supplied system prompt without changing its intent or authority.'),
      content: 'Original prompt',
      throwOnError: true
    })
    expect(screen.getByTestId('prompt-preview-reset-key')).toHaveTextContent('1')

    const undoButton = screen.getByRole('button', { name: 'Undo' })
    fireEvent.click(undoButton)

    expect(screen.getByLabelText('Prompt editor')).toHaveValue('Original prompt')
    expect(screen.getByTestId('prompt-preview-reset-key')).toHaveTextContent('2')
  })

  it('generates an assistant prompt from its name when the prompt is blank', async () => {
    render(<AssistantEditDialog open resource={{ ...ASSISTANT, prompt: '' }} onOpenChange={vi.fn()} />)

    selectTab('Prompt')
    const generateButton = screen.getByRole('button', { name: 'Generate prompt' })
    fireEvent.click(generateButton)

    await waitFor(() => expect(screen.getByLabelText('Prompt editor')).toHaveValue('Generated prompt'))
    expect(fetchGenerateMock).toHaveBeenCalledWith({
      prompt: expect.stringContaining('You are a Prompt Generator.'),
      content: 'Alpha Assistant',
      throwOnError: true
    })
    expect(fetchGenerateMock.mock.calls[0][0].prompt).not.toContain(
      'Create a useful system prompt from the supplied name or title.'
    )
    expect(screen.getByRole('button', { name: 'Polish prompt' })).toBeInTheDocument()
  })

  it('allows closing and tab navigation while an assistant prompt action is in flight', async () => {
    fetchGenerateMock.mockReturnValueOnce(new Promise<string>(() => undefined))
    const onOpenChange = vi.fn()
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)

    selectTab('Prompt')
    fireEvent.click(screen.getByRole('button', { name: 'Polish prompt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    selectTab('Basic')

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(screen.getByRole('tab', { name: 'Basic' })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the assistant edit dialog directly on the requested initial tab', () => {
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} initialTab="tools.mcp" />)

    expect(screen.getByRole('tab', { name: 'MCP' })).toHaveAttribute('aria-selected', 'true')
  })

  it('closes the assistant edit dialog before running model settings navigation on the next frame', async () => {
    function Host() {
      const [open, setOpen] = useState(true)
      const [target, setTarget] = useState<Assistant | null>(ASSISTANT)

      const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen)
        if (!nextOpen) setTarget(null)
      }

      return <AssistantEditDialog open={open} resource={target} onOpenChange={handleOpenChange} />
    }

    render(<Host />)
    const frames = mockDeferredAnimationFrames()

    fireEvent.click(screen.getByRole('button', { name: 'Open model settings' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(settingsNavigateMock).not.toHaveBeenCalled()

    await act(async () => {
      await Promise.resolve()
    })
    expect(frames.pendingCount()).toBeGreaterThan(0)
    frames.flushAllFrames()

    expect(settingsNavigateMock).toHaveBeenCalledTimes(1)
    frames.restore()
  })

  it('keeps popover content inside the dialog container', async () => {
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    fireEvent.click(screen.getByLabelText('Pick avatar'))

    expect(dialog).toContainElement(screen.getByRole('button', { name: 'Choose emoji' }))
  })

  it('keeps the dialog open and shows an error when save fails', async () => {
    updateAssistantMock.mockRejectedValueOnce(new Error('Network down'))
    const onOpenChange = vi.fn()
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Broken Assistant' } })
    expect(await screen.findByText('Save failed')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('keeps the dialog open after a successful auto-save', async () => {
    const onOpenChange = vi.fn()
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Saved Assistant' } })
    await waitFor(() => expect(updateAssistantMock).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument()
  })

  it('flushes a pending change and closes when the dialog is closed', async () => {
    const onOpenChange = vi.fn()
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated Assistant' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() =>
      expect(updateAssistantMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ name: 'Updated Assistant' })
      })
    )
    // The close now awaits the flush and only closes once it settles.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('persists the latest edit made while an earlier save is still in flight', async () => {
    let resolveFirstSave: (() => void) | undefined
    updateAssistantMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSave = () => resolve({ ...ASSISTANT, name: 'First Edit' })
        })
    )
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={vi.fn()} />)

    const nameInput = screen.getByLabelText('Name')
    fireEvent.change(nameInput, { target: { value: 'First Edit' } })
    await waitFor(() => expect(updateAssistantMock).toHaveBeenCalledTimes(1))
    expect(updateAssistantMock).toHaveBeenNthCalledWith(1, {
      body: expect.objectContaining({ name: 'First Edit' })
    })

    // Keep editing while the first PATCH is still in flight.
    fireEvent.change(nameInput, { target: { value: 'Second Edit' } })
    // Let the debounce fire; the in-flight guard must queue — not drop — this edit.
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(updateAssistantMock).toHaveBeenCalledTimes(1)

    resolveFirstSave?.()
    await waitFor(() => expect(updateAssistantMock).toHaveBeenCalledTimes(2))
    expect(updateAssistantMock).toHaveBeenNthCalledWith(2, {
      body: expect.objectContaining({ name: 'Second Edit' })
    })
  })

  it('prompts without closing or retrying an unchanged failed assistant save', async () => {
    updateAssistantMock.mockRejectedValueOnce(new Error('Network down'))
    const onOpenChange = vi.fn()
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Closing Edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(await screen.findByText('Save failed')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('Save failed')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    const saveAttemptsAfterFailure = updateAssistantMock.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(toast.error).toHaveBeenCalledTimes(2)
    expect(updateAssistantMock).toHaveBeenCalledTimes(saveAttemptsAfterFailure)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('retries saving when the form changes after a failed close', async () => {
    updateAssistantMock.mockRejectedValueOnce(new Error('Network down'))
    const onOpenChange = vi.fn()
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)

    const nameInput = screen.getByLabelText('Name')
    fireEvent.change(nameInput, { target: { value: 'First Closing Edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await screen.findByText('Save failed', undefined, { timeout: 5000 })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    const saveAttemptsAfterFailure = updateAssistantMock.mock.calls.length

    fireEvent.change(nameInput, { target: { value: 'Retry Closing Edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(updateAssistantMock.mock.calls.length).toBeGreaterThan(saveAttemptsAfterFailure))
    expect(updateAssistantMock).toHaveBeenLastCalledWith({
      body: expect.objectContaining({ name: 'Retry Closing Edit' })
    })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('clears the failed assistant save snapshot when reopened within the exit-animation window', async () => {
    // The host (useResourceCatalogController) keeps this dialog instance mounted for
    // DIALOG_EXIT_ANIMATION_MS after `open` goes false, so a reopen within that window
    // reuses the SAME component instance instead of remounting — simulate that with
    // `rerender` rather than a fresh `render`.
    updateAssistantMock.mockRejectedValueOnce(new Error('Network down'))
    const onOpenChange = vi.fn()
    const { rerender } = render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Repro Edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await screen.findByText('Save failed', undefined, { timeout: 5000 })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    // Simulate an external close, then reopen on the same instance before it unmounts.
    rerender(<AssistantEditDialog open={false} resource={ASSISTANT} onOpenChange={onOpenChange} />)
    rerender(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)
    const saveAttemptsBeforeRetry = updateAssistantMock.mock.calls.length

    // Make the exact same edit again. The new editing session must not mistake it
    // for the prior session's failed snapshot and block the save.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Repro Edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(updateAssistantMock.mock.calls.length).toBeGreaterThan(saveAttemptsBeforeRetry)
    expect(updateAssistantMock).toHaveBeenLastCalledWith({
      body: expect.objectContaining({ name: 'Repro Edit' })
    })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('reuses the in-flight save when closing mid-save instead of racing a second one', async () => {
    let resolveSave: (() => void) | undefined
    updateAssistantMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = () => resolve({ ...ASSISTANT, name: 'Mid Save' })
        })
    )
    const onOpenChange = vi.fn()
    render(<AssistantEditDialog open resource={ASSISTANT} onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mid Save' } })
    await waitFor(() => expect(updateAssistantMock).toHaveBeenCalledTimes(1))

    // Close while that save is still in flight: no second concurrent save, and the
    // dialog must not close until the in-flight save settles.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(updateAssistantMock).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    resolveSave?.()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(updateAssistantMock).toHaveBeenCalledTimes(1)
  })
})
