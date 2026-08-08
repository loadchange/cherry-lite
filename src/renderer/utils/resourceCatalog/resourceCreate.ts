import type { ResourceCreateValues } from '@renderer/types/resourceCatalog'
import type { CreateAssistantDto } from '@shared/data/api/schemas/assistants'

/** Map the shared create-wizard values to the Assistant DataApi contract. */
export function buildCreateAssistantDto(values: ResourceCreateValues): CreateAssistantDto {
  return {
    name: values.name,
    emoji: values.avatar,
    modelId: values.modelId,
    description: values.description,
    prompt: values.prompt
  }
}
