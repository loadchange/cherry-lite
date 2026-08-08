import type { TFunction } from 'i18next'
import { Globe, Paperclip, Zap } from 'lucide-react'

import { type ComposerToolScope, type ToolComposerToolbarContribution, TopicType } from './types'

interface ComposerToolbarManifestDefinition {
  toolbar: ToolComposerToolbarContribution
  label: (t: TFunction) => string
  visibleInScopes: ComposerToolScope[]
}

export interface ComposerToolbarManifest extends ToolComposerToolbarContribution {
  label: string
}

export const ATTACHMENT_TOOLBAR_MANIFEST: ComposerToolbarManifestDefinition = {
  toolbar: {
    id: 'attachment',
    kind: 'dialog',
    order: 10,
    icon: <Paperclip />
  },
  label: (t) => t('chat.input.upload.attachment'),
  visibleInScopes: [TopicType.Chat, TopicType.Session, 'quick-assistant']
}

export const WEB_SEARCH_TOOLBAR_MANIFEST: ComposerToolbarManifestDefinition = {
  toolbar: {
    id: 'web-search',
    kind: 'command',
    order: 30,
    icon: <Globe />
  },
  label: (t) => t('chat.input.web_search.label'),
  visibleInScopes: [TopicType.Chat]
}

export const QUICK_PHRASES_TOOLBAR_MANIFEST: ComposerToolbarManifestDefinition = {
  toolbar: {
    id: 'quick-phrases',
    kind: 'panel',
    order: 70,
    icon: <Zap />
  },
  label: (t) => t('settings.prompts.title'),
  visibleInScopes: [TopicType.Chat, TopicType.Session, 'quick-assistant']
}

const COMPOSER_TOOLBAR_MANIFESTS: ComposerToolbarManifestDefinition[] = [
  ATTACHMENT_TOOLBAR_MANIFEST,
  WEB_SEARCH_TOOLBAR_MANIFEST,
  QUICK_PHRASES_TOOLBAR_MANIFEST
]

/**
 * Returns scope-only toolbar metadata without importing tool runtimes or
 * evaluating model-dependent conditions.
 */
export const getComposerToolbarManifestsForScope = (
  scope: ComposerToolScope,
  t: TFunction
): ComposerToolbarManifest[] =>
  COMPOSER_TOOLBAR_MANIFESTS.filter((manifest) => manifest.visibleInScopes.includes(scope))
    .map((manifest) => ({
      ...manifest.toolbar,
      label: manifest.label(t)
    }))
    .sort((left, right) => left.order - right.order)
