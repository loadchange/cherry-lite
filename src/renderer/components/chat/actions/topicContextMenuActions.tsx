import { createActionRegistry } from '@renderer/components/chat/actions/actionRegistry'
import type { ResolvedAction } from '@renderer/components/chat/actions/actionTypes'
import { OpenInNewWindowIcon } from '@renderer/components/icons/WindowIcons'
import type { Topic } from '@renderer/types/topic'
import type { TopicTabPosition } from '@shared/data/preference/preferenceTypes'
import type { TFunction } from 'i18next'
import {
  BrushCleaning,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  Image,
  MoveRight,
  PanelLeft,
  PinIcon,
  PinOffIcon,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { ReactNode } from 'react'

type TopicMenuHandler = (topic: Topic) => void | Promise<void>
type TopicMoveToAssistantHandler = (topic: Topic, assistantId: string) => void | Promise<void>

export interface TopicMoveAssistantTarget {
  id: string
  name: string
  icon?: ReactNode
}

export interface TopicActionContext {
  isActiveInCurrentTab: boolean
  isRenaming: boolean
  onAutoRename: TopicMenuHandler
  onClearMessages: TopicMenuHandler
  onCopyImage: TopicMenuHandler
  onCopyMarkdown: TopicMenuHandler
  onCopyPlainText: TopicMenuHandler
  onDelete: TopicMenuHandler
  assistantMoveTargets: readonly TopicMoveAssistantTarget[]
  onMoveToAssistant?: TopicMoveToAssistantHandler
  onOpenInNewTab?: TopicMenuHandler
  onOpenInNewWindow?: TopicMenuHandler
  onPinTopic: TopicMenuHandler
  onSetPanePosition?: (position: TopicTabPosition) => void | Promise<void>
  onStartRename: TopicMenuHandler
  panePosition?: TopicTabPosition
  t: TFunction
  topic: Topic
  topicsLength: number
}

const topicActionRegistry = createActionRegistry<TopicActionContext>()
const MOVE_TO_ASSISTANT_ACTION_PREFIX = 'topic.move-to-assistant.'

function buildMoveToAssistantActionId(assistantId: string) {
  return `${MOVE_TO_ASSISTANT_ACTION_PREFIX}${encodeURIComponent(assistantId)}`
}

function getMoveToAssistantTargetId(actionId: string) {
  if (!actionId.startsWith(MOVE_TO_ASSISTANT_ACTION_PREFIX)) return undefined

  try {
    return decodeURIComponent(actionId.slice(MOVE_TO_ASSISTANT_ACTION_PREFIX.length))
  } catch {
    return undefined
  }
}

function renderMoveAssistantTargetIcon(icon: ReactNode) {
  if (!icon) return undefined

  return (
    <span className="flex size-4 items-center justify-center [&>*]:m-0 [&>*]:max-h-full [&>*]:max-w-full">{icon}</span>
  )
}

topicActionRegistry.registerCommand({
  id: 'topic.auto-rename',
  run: ({ onAutoRename, topic }) => onAutoRename(topic)
})

topicActionRegistry.registerCommand({
  id: 'topic.rename',
  run: ({ onStartRename, topic }) => onStartRename(topic)
})

topicActionRegistry.registerCommand({
  id: 'topic.pin',
  run: ({ onPinTopic, topic }) => onPinTopic(topic)
})

topicActionRegistry.registerCommand({
  id: 'topic.open-in-new-tab',
  availability: ({ isActiveInCurrentTab, onOpenInNewTab }) => ({
    visible: !!onOpenInNewTab && !isActiveInCurrentTab,
    enabled: !!onOpenInNewTab && !isActiveInCurrentTab
  }),
  run: ({ onOpenInNewTab, topic }) => onOpenInNewTab?.(topic)
})

topicActionRegistry.registerCommand({
  id: 'topic.open-in-new-window',
  availability: ({ onOpenInNewWindow }) => ({
    visible: !!onOpenInNewWindow,
    enabled: !!onOpenInNewWindow
  }),
  run: ({ onOpenInNewWindow, topic }) => onOpenInNewWindow?.(topic)
})

topicActionRegistry.registerCommand({
  id: 'topic.position-left',
  availability: ({ onSetPanePosition, panePosition }) => ({
    visible: !!onSetPanePosition && !!panePosition,
    enabled: !!onSetPanePosition && panePosition !== 'left'
  }),
  run: ({ onSetPanePosition }) => onSetPanePosition?.('left')
})

topicActionRegistry.registerCommand({
  id: 'topic.position-right',
  availability: ({ onSetPanePosition, panePosition }) => ({
    visible: !!onSetPanePosition && !!panePosition,
    enabled: !!onSetPanePosition && panePosition !== 'right'
  }),
  run: ({ onSetPanePosition }) => onSetPanePosition?.('right')
})

topicActionRegistry.registerCommand({
  id: 'topic.clear-messages',
  run: ({ onClearMessages, topic }) => onClearMessages(topic)
})

topicActionRegistry.registerCommand({
  id: 'topic.copy.image',
  run: ({ onCopyImage, topic }) => onCopyImage(topic)
})

topicActionRegistry.registerCommand({
  id: 'topic.copy.markdown',
  run: ({ onCopyMarkdown, topic }) => onCopyMarkdown(topic)
})

topicActionRegistry.registerCommand({
  id: 'topic.copy.plain-text',
  run: ({ onCopyPlainText, topic }) => onCopyPlainText(topic)
})

topicActionRegistry.registerCommand({
  id: 'topic.delete',
  run: ({ onDelete, topic }) => onDelete(topic)
})

topicActionRegistry.registerAction({
  id: 'topic.auto-rename',
  commandId: 'topic.auto-rename',
  label: ({ t }) => t('chat.topics.auto_rename'),
  icon: () => <Sparkles size={14} />,
  order: 10,
  surface: 'menu',
  availability: ({ isRenaming }) => ({ enabled: !isRenaming })
})

topicActionRegistry.registerAction({
  id: 'topic.rename',
  commandId: 'topic.rename',
  label: ({ t }) => t('chat.topics.edit.title'),
  icon: () => <Edit3 size={14} />,
  order: 20,
  surface: 'menu',
  availability: ({ isRenaming }) => ({ enabled: !isRenaming })
})

topicActionRegistry.registerAction({
  id: 'topic.pin',
  commandId: 'topic.pin',
  label: ({ t, topic }) => (topic.pinned ? t('chat.topics.unpin') : t('chat.topics.pin')),
  icon: ({ topic }) => (topic.pinned ? <PinOffIcon size={14} /> : <PinIcon size={14} />),
  order: 30,
  surface: 'menu'
})

topicActionRegistry.registerAction({
  id: 'topic.move-to-assistant',
  label: ({ t }) => t('chat.topics.move_to'),
  icon: () => <MoveRight size={14} />,
  order: 34,
  surface: 'menu',
  availability: ({ assistantMoveTargets, onMoveToAssistant }) => ({
    visible: !!onMoveToAssistant && assistantMoveTargets.length > 0,
    enabled: !!onMoveToAssistant && assistantMoveTargets.length > 0
  }),
  children: ({ assistantMoveTargets }) =>
    assistantMoveTargets.map((target, index) => ({
      id: buildMoveToAssistantActionId(target.id),
      label: target.name,
      icon: renderMoveAssistantTargetIcon(target.icon),
      order: index,
      surface: 'menu'
    }))
})

topicActionRegistry.registerAction({
  id: 'topic.open-in-new-tab',
  commandId: 'topic.open-in-new-tab',
  label: ({ t }) => t('common.open_in_new_tab'),
  icon: () => <ExternalLink size={14} />,
  order: 35,
  surface: 'menu'
})

topicActionRegistry.registerAction({
  id: 'topic.open-in-new-window',
  commandId: 'topic.open-in-new-window',
  label: ({ t }) => t('tab.open_in_new_window'),
  icon: () => <OpenInNewWindowIcon size={14} />,
  order: 37,
  surface: 'menu'
})

topicActionRegistry.registerAction({
  id: 'topic.position',
  label: ({ t }) => t('settings.topic.position.label'),
  icon: () => <PanelLeft size={14} />,
  order: 38,
  surface: 'menu',
  availability: ({ onSetPanePosition, panePosition }) => ({ visible: !!onSetPanePosition && !!panePosition }),
  children: [
    {
      id: 'topic.position-left',
      commandId: 'topic.position-left',
      label: ({ t }) => t('settings.topic.position.left'),
      order: 10,
      surface: 'menu'
    },
    {
      id: 'topic.position-right',
      commandId: 'topic.position-right',
      label: ({ t }) => t('settings.topic.position.right'),
      order: 20,
      surface: 'menu'
    }
  ]
})

topicActionRegistry.registerAction({
  id: 'topic.clear-messages',
  commandId: 'topic.clear-messages',
  label: ({ t }) => t('chat.topics.clear.title'),
  icon: () => <BrushCleaning size={14} />,
  order: 40,
  surface: 'menu'
})

topicActionRegistry.registerAction({
  id: 'topic.copy',
  label: ({ t }) => t('chat.topics.copy.title'),
  icon: () => <Copy size={14} />,
  group: 'share',
  order: 80,
  surface: 'menu',
  children: [
    {
      id: 'topic.copy.image',
      commandId: 'topic.copy.image',
      label: ({ t }) => t('chat.topics.copy.image'),
      icon: () => <Image size={14} />,
      order: 10,
      surface: 'menu'
    },
    {
      id: 'topic.copy.markdown',
      commandId: 'topic.copy.markdown',
      label: ({ t }) => t('chat.topics.copy.md'),
      icon: () => <FileText size={14} />,
      order: 20,
      surface: 'menu'
    },
    {
      id: 'topic.copy.plain-text',
      commandId: 'topic.copy.plain-text',
      label: ({ t }) => t('chat.topics.copy.plain_text'),
      icon: () => <FileText size={14} />,
      order: 30,
      surface: 'menu'
    }
  ]
})

topicActionRegistry.registerAction({
  id: 'topic.delete',
  commandId: 'topic.delete',
  label: ({ t }) => t('common.delete'),
  icon: () => <Trash2 size={14} />,
  group: 'danger',
  order: 90,
  surface: 'menu',
  danger: true,
  // Deleting the last topic is allowed — the delete handler opens a fresh empty one afterwards, so
  // the view is never stranded. Pinned topics must be unpinned before they can be deleted.
  availability: ({ topic }) => ({ visible: !topic.pinned }),
  confirm: ({ t }) => ({
    title: t('chat.topics.manage.delete.confirm.title'),
    description: t('chat.topics.manage.delete.confirm.content', { count: 1 }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    destructive: true
  })
})

export function resolveTopicMenuActions(context: TopicActionContext): ResolvedAction<TopicActionContext>[] {
  return topicActionRegistry.resolve(context, 'menu')
}

export async function executeTopicMenuAction(
  action: ResolvedAction<TopicActionContext>,
  context: TopicActionContext
): Promise<boolean> {
  const targetAssistantId = getMoveToAssistantTargetId(action.id)
  if (targetAssistantId) {
    if (!context.onMoveToAssistant) return false
    if (context.topic.assistantId === targetAssistantId) return false
    if (!context.assistantMoveTargets.some((target) => target.id === targetAssistantId)) return false
    await context.onMoveToAssistant(context.topic, targetAssistantId)
    return true
  }

  return topicActionRegistry.execute(action.id, context)
}
