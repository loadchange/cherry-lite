import type { Assistant } from '@shared/data/types/assistant'
import type { Topic as ApiTopic } from '@shared/data/types/topic'
import type { TFunction } from 'i18next'
import { Bot } from 'lucide-react'

import type { HistorySourceOption } from './historyRecordsTypes'

export const ALL_SOURCE_ID = 'all'
const UNLINKED_ASSISTANT_SOURCE_ID = '__unlinked_assistant__'

export function getTopicSourceId(topic: Pick<ApiTopic, 'assistantId'>, assistantById?: ReadonlyMap<string, Assistant>) {
  if (!topic.assistantId) return UNLINKED_ASSISTANT_SOURCE_ID
  if (assistantById && !assistantById.has(topic.assistantId)) return UNLINKED_ASSISTANT_SOURCE_ID

  return topic.assistantId
}

export function findAdjacentHistoryRecordAfterBulkDelete<T>(
  items: readonly T[],
  deletedIds: readonly string[],
  activeId: string,
  getId: (item: T) => string
): T | undefined {
  const deletedIdSet = new Set(deletedIds)
  const activeIndex = items.findIndex((item) => getId(item) === activeId)
  if (activeIndex < 0) return undefined

  for (let index = activeIndex + 1; index < items.length; index += 1) {
    if (!deletedIdSet.has(getId(items[index]))) return items[index]
  }

  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    if (!deletedIdSet.has(getId(items[index]))) return items[index]
  }

  return undefined
}

export function buildAssistantSources(
  topics: readonly ApiTopic[],
  assistantById: ReadonlyMap<string, Assistant>,
  assistantRankById: ReadonlyMap<string, number>,
  unlinkedAssistantLabel: string,
  t: TFunction
): HistorySourceOption[] {
  const hasUnlinkedAssistant = topics.some(
    (topic) => getTopicSourceId(topic, assistantById) === UNLINKED_ASSISTANT_SOURCE_ID
  )

  return [
    {
      id: ALL_SOURCE_ID,
      label: t('common.all')
    },
    ...Array.from(assistantById.values())
      .sort(
        (left, right) =>
          getAssistantSourceRank(left.id, assistantRankById) - getAssistantSourceRank(right.id, assistantRankById)
      )
      .map((assistant) => ({
        id: assistant.id,
        label: assistant.name,
        icon: assistant.emoji ? <span className="text-sm leading-none">{assistant.emoji}</span> : <Bot size={15} />
      })),
    ...(hasUnlinkedAssistant
      ? [
          {
            id: UNLINKED_ASSISTANT_SOURCE_ID,
            label: unlinkedAssistantLabel,
            icon: <Bot size={15} />
          }
        ]
      : [])
  ]
}

function getAssistantSourceRank(sourceId: string, assistantRankById: ReadonlyMap<string, number>) {
  const assistantRank = assistantRankById.get(sourceId)
  if (assistantRank !== undefined) return assistantRank

  return Number.MAX_SAFE_INTEGER
}
