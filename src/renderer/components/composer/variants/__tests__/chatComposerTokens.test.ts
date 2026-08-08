import type { ComposerAttachment } from '@renderer/utils/message/composerAttachment'
import { describe, expect, it } from 'vitest'

import { chatComposerTokenId, getComposerTokenIds } from '../chatComposerTokens'

describe('chat composer token mapping', () => {
  it('uses the unguessable file token source id instead of the file path', () => {
    const file = { fileTokenSourceId: 'source-fallback', path: '/tmp/fallback.txt' } as ComposerAttachment

    expect(chatComposerTokenId.file(file)).toBe('file:source-fallback')
  })

  it('does not create a fixed fallback token id for files without a source id', () => {
    const file = { path: '/tmp/chat.ts' } as ComposerAttachment

    expect(() => chatComposerTokenId.file(file)).toThrow('fileTokenSourceId')
  })

  it('extracts token ids by kind', () => {
    const ids = getComposerTokenIds(
      [
        { id: 'file:file-1', kind: 'file', label: 'chat.ts', index: 0, textOffset: 0 },
        { id: 'reference:docs', kind: 'reference', label: 'Docs', index: 1, textOffset: 0 }
      ],
      'file'
    )

    expect(ids).toEqual(new Set(['file:file-1']))
  })
})
