import type { DiagnosisResult } from '@renderer/utils/errorDiagnosis'
import type { CherryMessagePart } from '@shared/data/types/message'
import { useCallback } from 'react'

import type { MessageListActions, MessageListItem, MessageStreamingLayers } from '../types'
import { useMessageActivityState } from './useMessageActivityState'
import { useMessageErrorActions } from './useMessageErrorActions'
import { useMessageHeaderCapabilities } from './useMessageHeaderCapabilities'
import { useMessageLeafCapabilities } from './useMessageLeafCapabilities'
import { useMessageListRenderConfig } from './useMessageListRenderConfig'
import { useMessageMenuConfig } from './useMessageMenuConfig'
import { useMessageSelectionController } from './useMessageSelectionController'
import { useMessageUiStateCache } from './useMessageUiStateCache'

interface UseMessageListAdapterCapabilitiesOptions {
  topicId: string
  messages: MessageListItem[]
  partsByMessageId: Record<string, CherryMessagePart[]>
  streamingLayers?: MessageStreamingLayers
  deleteMessage?: MessageListActions['deleteMessage']
  persistDiagnosis?: (partId: string, diagnosis: DiagnosisResult) => void | Promise<void>
}

/**
 * Shared message-list adapter wiring. Domain adapters inject their own data,
 * mutations, and persistence; this hook assembles the common UI capabilities,
 * including the save feed into the selection controller.
 */
export function useMessageListAdapterCapabilities({
  topicId,
  messages,
  partsByMessageId,
  streamingLayers,
  deleteMessage,
  persistDiagnosis
}: UseMessageListAdapterCapabilitiesOptions) {
  const getMessageActivityState = useMessageActivityState(topicId, partsByMessageId)
  const { renderConfig, updateRenderConfig } = useMessageListRenderConfig()
  const menuConfig = useMessageMenuConfig()
  const saveTextFile = useCallback((fileName: string, content: string) => {
    return window.api.file.save(fileName, content)
  }, [])
  const leafCapabilities = useMessageLeafCapabilities({ partsByMessageId, streamingLayers })
  const headerCapabilities = useMessageHeaderCapabilities()
  const messageUiStateCache = useMessageUiStateCache()
  const errorActions = useMessageErrorActions({ persistDiagnosis })
  const selectionController = useMessageSelectionController({
    topicId,
    messages,
    partsByMessageId,
    deleteMessage,
    saveTextFile,
    copyRichContent: leafCapabilities.copyRichContent
  })

  return {
    errorActions,
    getMessageActivityState,
    headerCapabilities,
    leafCapabilities,
    menuConfig,
    messageUiStateCache,
    renderConfig,
    saveTextFile,
    selectionController,
    updateRenderConfig
  }
}
