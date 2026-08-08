import { SystemProviderIds } from '@shared/utils/systemProviderId'

import { cherryInOAuthProvider } from './providers/cherryin'
import type { OAuthRuntimeProviderDefinition } from './types'

/**
 * Registry of OAuth runtime definitions, one entry per login-based provider.
 * Each provider's config + flow lives in its own `providers/<id>.ts`; this file
 * only wires them onto their provider ids. Add a provider by dropping a new file
 * in `providers/` and registering it here.
 */
export const oauthProviderDefinitions = {
  [SystemProviderIds.cherryin]: cherryInOAuthProvider
} satisfies Record<string, OAuthRuntimeProviderDefinition>

export type OAuthProviderId = keyof typeof oauthProviderDefinitions
