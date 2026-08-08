import { beforeEach, describe, expect, it, vi } from 'vitest'

const { appGetMock } = vi.hoisted(() => ({ appGetMock: vi.fn() }))
vi.mock('@application', () => ({ application: { get: appGetMock } }))

import { oauthHandlers } from '../oauth'

const runtimeService = {
  signIn: vi.fn((providerId: string) => Promise.resolve({ accountId: `${providerId}-account` })),
  hasToken: vi.fn(() => Promise.resolve(true)),
  getAccount: vi.fn(() => Promise.resolve({ accountId: 'acc-1' })),
  logout: vi.fn(() => Promise.resolve()),
  startDeepLinkFlow: vi.fn(() => Promise.resolve({ authUrl: 'https://open.cherryin.ai/auth', state: 'st' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  appGetMock.mockImplementation(() => runtimeService)
})

const ctx = { senderId: 'w1' as const }
const provider = { providerId: 'cherryin' }

describe('oauthHandlers', () => {
  it('dispatches sign_in to OAuthRuntimeService with the provider id', async () => {
    await expect(oauthHandlers['oauth.sign_in'](provider, ctx)).resolves.toEqual({ accountId: 'cherryin-account' })
    expect(appGetMock).toHaveBeenCalledWith('OAuthRuntimeService')
    expect(runtimeService.signIn).toHaveBeenCalledWith('cherryin')
  })

  it('dispatches has_token to OAuthRuntimeService', async () => {
    await expect(oauthHandlers['oauth.has_token'](provider, ctx)).resolves.toBe(true)
    expect(runtimeService.hasToken).toHaveBeenCalledWith('cherryin')
  })

  it('dispatches get_account to OAuthRuntimeService', async () => {
    await expect(oauthHandlers['oauth.get_account'](provider, ctx)).resolves.toEqual({ accountId: 'acc-1' })
    expect(runtimeService.getAccount).toHaveBeenCalledWith('cherryin')
  })

  it('dispatches logout to OAuthRuntimeService', async () => {
    await oauthHandlers['oauth.logout'](provider, ctx)
    expect(runtimeService.logout).toHaveBeenCalledWith('cherryin')
  })

  it('forwards the initiator window id, provider, and hosts to startDeepLinkFlow', async () => {
    await expect(
      oauthHandlers['oauth.start_deep_link_flow'](
        { providerId: 'cherryin', oauthServer: 'https://open.cherryin.ai', apiHost: 'https://api.cherryin.ai' },
        ctx
      )
    ).resolves.toEqual({ authUrl: 'https://open.cherryin.ai/auth', state: 'st' })
    expect(runtimeService.startDeepLinkFlow).toHaveBeenCalledWith('w1', 'cherryin', {
      oauthServer: 'https://open.cherryin.ai',
      apiHost: 'https://api.cherryin.ai'
    })
  })

  // apiHost falls back to oauthServer; a null senderId (source-trust caller with
  // no window) passes through so the runtime rejects it.
  it('defaults apiHost to oauthServer and passes a null senderId through', async () => {
    await oauthHandlers['oauth.start_deep_link_flow'](
      { providerId: 'cherryin', oauthServer: 'https://open.cherryin.ai' },
      { senderId: null }
    )
    expect(runtimeService.startDeepLinkFlow).toHaveBeenCalledWith(null, 'cherryin', {
      oauthServer: 'https://open.cherryin.ai',
      apiHost: 'https://open.cherryin.ai'
    })
  })
})
