import type { MessageListItem } from '@renderer/components/chat/messages/types'
import { getTtsMessageText, ttsContentVersion } from '@renderer/hooks/useTts'
import { uuid } from '@renderer/utils/uuid'
import type { CherryMessagePart } from '@shared/data/types/message'
import { useMemo, useState } from 'react'

import ReadAloudButton from './ReadAloudButton'

export default function MessageReadAloudButton({
  message,
  parts,
  disabled
}: {
  message: MessageListItem
  parts: CherryMessagePart[]
  disabled: boolean
}) {
  const [instance] = useState(() => uuid())
  const text = useMemo(() => getTtsMessageText(parts), [parts])
  return (
    <ReadAloudButton
      sourceId={`chat:${message.topicId}:${message.id}:${instance}:${ttsContentVersion(text)}`}
      text={text}
      disabled={disabled}
      className="message-action-button"
    />
  )
}
