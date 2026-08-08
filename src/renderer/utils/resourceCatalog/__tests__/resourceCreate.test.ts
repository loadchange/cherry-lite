import type { ResourceCreateValues } from '@renderer/types/resourceCatalog'
import { describe, expect, it } from 'vitest'

import { buildCreateAssistantDto } from '../resourceCreate'

const values: ResourceCreateValues = {
  avatar: '🤖',
  name: 'Researcher',
  modelId: 'provider::model',
  description: 'Investigates a topic',
  prompt: 'Use cited sources'
}

describe('resource create DTO mapping', () => {
  it('maps every assistant-specific field', () => {
    expect(buildCreateAssistantDto(values)).toEqual({
      name: 'Researcher',
      emoji: '🤖',
      modelId: 'provider::model',
      description: 'Investigates a topic',
      prompt: 'Use cited sources'
    })
  })
})
