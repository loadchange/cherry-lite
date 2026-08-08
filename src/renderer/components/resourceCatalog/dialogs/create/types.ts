import type { ResourceCreateValues } from '@renderer/types/resourceCatalog'
import type { UniqueModelId } from '@shared/data/types/model'

export type ResourceCreateWizardKind = 'assistant'

/**
 * Internal react-hook-form state for the stepped create wizard.
 *
 * Field names are deliberately aligned with the shared edit-dialog field
 * components (`avatar`, `name`, `description`, `modelId`) so those components
 * can be reused as-is.
 */
export type ResourceCreateWizardFormValues = {
  avatar: string
  name: string
  description: string
  modelId: UniqueModelId | null
  prompt: string
}

/**
 * Validated submit payload handed to the caller's `onSubmit`. `modelId` is
 * guaranteed non-null (basic-step validation gates submission).
 */
export type ResourceCreateWizardValues = ResourceCreateValues
