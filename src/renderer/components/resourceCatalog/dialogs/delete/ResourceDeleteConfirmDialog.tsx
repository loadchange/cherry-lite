import { ConfirmDialog } from '@cherrystudio/ui'
import { useAssistantMutationsById, usePromptMutationsById } from '@renderer/hooks/resourceCatalog'
import { toast } from '@renderer/services/toast'
import type { ResourceItem } from '@renderer/types/resourceCatalog'
import type { FC } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  resource: ResourceItem | null
  onClose: () => void
}

/**
 * Delete confirmation for library resources. Dispatches the destructive
 * action by `resource.type` through the matching DataApi
 * `useXxxMutationsById.deleteXxx`.
 */
export const ResourceDeleteConfirmDialog: FC<Props> = ({ resource, onClose }) => {
  if (!resource) return null
  return <DeleteDialogBody resource={resource} onClose={onClose} />
}

const DeleteDialogBody: FC<{ resource: ResourceItem; onClose: () => void }> = ({ resource, onClose }) => {
  if (resource.type === 'assistant') return <AssistantDeleteDialog resource={resource} onClose={onClose} />
  return <PromptDeleteDialog resource={resource} onClose={onClose} />
}

const AssistantDeleteDialog: FC<{ resource: Extract<ResourceItem, { type: 'assistant' }>; onClose: () => void }> = ({
  resource,
  onClose
}) => {
  const { deleteAssistant } = useAssistantMutationsById(resource.id)
  return <DeleteDialogContent resource={resource} onClose={onClose} onDelete={deleteAssistant} />
}

const PromptDeleteDialog: FC<{ resource: Extract<ResourceItem, { type: 'prompt' }>; onClose: () => void }> = ({
  resource,
  onClose
}) => {
  const { deletePrompt } = usePromptMutationsById(resource.id)
  return <DeleteDialogContent resource={resource} onClose={onClose} onDelete={deletePrompt} />
}

const DeleteDialogContent: FC<{ resource: ResourceItem; onClose: () => void; onDelete: () => Promise<void> }> = ({
  resource,
  onClose,
  onDelete
}) => {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)

  const handleConfirm = useCallback(async () => {
    setPending(true)
    try {
      await onDelete()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.delete_failed'))
      throw error
    } finally {
      setPending(false)
    }
  }, [onDelete, t])

  const { title, description, confirmText } = useMemo(() => {
    if (resource.type === 'prompt') {
      return {
        title: t('settings.prompts.delete'),
        description: t('settings.prompts.deleteConfirm'),
        confirmText: t('common.delete')
      }
    }
    return {
      title: t('assistants.delete.title'),
      description: t('assistants.delete.content'),
      confirmText: t('common.delete')
    }
  }, [resource.type, t])

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
      title={title}
      description={description}
      confirmText={confirmText}
      cancelText={t('common.cancel')}
      destructive
      confirmLoading={pending}
      onConfirm={handleConfirm}
    />
  )
}
