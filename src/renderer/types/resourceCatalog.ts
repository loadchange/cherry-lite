import type { Assistant } from '@shared/data/types/assistant'
import type { UniqueModelId } from '@shared/data/types/model'
import type { Prompt } from '@shared/data/types/prompt'

export type ResourceType = 'assistant' | 'prompt'

export type ResourceEditDialogTarget = { kind: 'assistant'; id: string } & {
  /** Leaf tab id to open the dialog on (e.g. `tools.mcp`). */
  initialTab?: string
}

/** Validated values shared by every Assistant creation entry point. */
export type ResourceCreateValues = {
  avatar: string
  name: string
  modelId: UniqueModelId
  description: string
  prompt: string
}

export type SortKey = 'updatedAt' | 'createdAt' | 'name'

interface ResourceItemBase<TType extends ResourceType, TRaw> {
  id: string
  type: TType
  name: string
  description: string
  avatar: string
  model?: string
  createdAt: string
  updatedAt: string
  raw: TRaw
}

export type ResourceItem =
  | (ResourceItemBase<'assistant', Assistant> & { groupId?: string; groupName?: string })
  | (ResourceItemBase<'prompt', Prompt> & { groupId?: never; groupName?: never })

export interface GroupItem {
  id: string
  name: string
  count: number
}

export interface ResourceTypeUIConfig {
  icon: React.ElementType
  color: string
}
