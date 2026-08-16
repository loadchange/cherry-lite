import { usePreference } from '@data/hooks/usePreference'
import type { MessageMenuConfig } from '@renderer/components/chat/messages/types'
import { useMemo } from 'react'

export function useMessageMenuConfig(): MessageMenuConfig {
  const [enableDeveloperMode] = usePreference('app.developer_mode.enabled')
  const [confirmDeleteMessage] = usePreference('chat.message.confirm_delete')

  return useMemo(() => ({ confirmDeleteMessage, enableDeveloperMode }), [confirmDeleteMessage, enableDeveloperMode])
}
