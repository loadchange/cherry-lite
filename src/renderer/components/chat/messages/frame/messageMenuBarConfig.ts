export type MessageMenuBarButtonId =
  | 'user-edit'
  | 'copy'
  | 'read-aloud'
  | 'assistant-regenerate'
  | 'assistant-mention-model'
  | 'translate'
  | 'useful'
  | 'delete'
  | 'more-menu'

export const DEFAULT_MESSAGE_MENUBAR_BUTTON_IDS: MessageMenuBarButtonId[] = [
  'copy',
  'read-aloud',
  'user-edit',
  'assistant-regenerate',
  'assistant-mention-model',
  'translate',
  'useful',
  'delete',
  'more-menu'
]

export const STREAMING_DISABLED_BUTTON_IDS: ReadonlySet<MessageMenuBarButtonId> = new Set([
  'read-aloud',
  'user-edit',
  'delete',
  'assistant-regenerate'
])
