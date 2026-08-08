import { ResourceCreateWizard } from '@renderer/components/resourceCatalog/dialogs/create'
import { ResourceEditDialogHost } from '@renderer/components/resourceCatalog/dialogs/edit'
import { ImportAssistantDialog } from '@renderer/components/resourceCatalog/dialogs/import'
import type { useResourceCatalogController } from '@renderer/hooks/resourceCatalog'
import type { ResourceType } from '@renderer/types/resourceCatalog'
import { isNonChatModel } from '@shared/utils/model'

import { AssistantLibraryDialog } from './AssistantLibraryDialog'

type ResourceCatalogDialogsProps = {
  dialogs: ReturnType<typeof useResourceCatalogController>['dialogs']
  onOpenAssistantChat?: (assistantId: string) => void
  onRefetch: ReturnType<typeof useResourceCatalogController>['refetch']
  resourceType: Extract<ResourceType, 'assistant'>
}

export function ResourceCatalogDialogs({
  dialogs,
  onOpenAssistantChat,
  onRefetch,
  resourceType
}: ResourceCatalogDialogsProps) {
  return (
    <>
      <ImportAssistantDialog
        open={dialogs.assistantImportOpen}
        onOpenChange={dialogs.setAssistantImportOpen}
        onImported={onRefetch}
      />
      {resourceType === 'assistant' ? (
        <AssistantLibraryDialog
          open={dialogs.assistantLibraryOpen}
          onOpenChange={dialogs.setAssistantLibraryOpen}
          onAssistantAdded={onRefetch}
          onOpenAssistantChat={onOpenAssistantChat}
        />
      ) : null}
      <ResourceCreateWizard
        kind={dialogs.createDialogKind ?? 'assistant'}
        open={dialogs.createDialogOpen}
        isSubmitting={dialogs.creatingResource}
        modelFilter={(candidate) => !isNonChatModel(candidate)}
        onOpenChange={dialogs.handleCreateDialogOpenChange}
        onSubmit={dialogs.handleSubmitCreateResource}
      />
      <ResourceEditDialogHost
        target={dialogs.editDialogTarget}
        onOpenChange={(open) => {
          if (!open) dialogs.setEditDialogTarget(null)
        }}
      />
    </>
  )
}
