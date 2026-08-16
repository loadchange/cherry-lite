import { describe, expect, it } from 'vitest'

import { notarizeOptions, resolveAppBundleId, resolveNotarizeAction } from '../notarize'

describe('resolveAppBundleId', () => {
  it('prefers electron-builder appInfo.id', () => {
    expect(resolveAppBundleId({ appInfo: { id: 'com.example.app' }, config: { appId: 'com.other.app' } })).toBe(
      'com.example.app'
    )
  })

  it('falls back to config.appId then the Lite bundle id', () => {
    expect(resolveAppBundleId({ config: { appId: 'com.example.from-config' } })).toBe('com.example.from-config')
    expect(resolveAppBundleId({})).toBe('com.loadchange.CherryStudioLite')
  })
})

describe('resolveNotarizeAction', () => {
  const passwordCredentials = {
    APPLE_ID: 'dev@example.com',
    APPLE_APP_SPECIFIC_PASSWORD: 'xxxx-xxxx-xxxx-xxxx',
    APPLE_TEAM_ID: 'ABCD123456'
  }

  const apiKeyCredentials = {
    APPLE_API_KEY_PATH: '/tmp/AuthKey.p8',
    APPLE_API_KEY_ID: 'ABCDE12345',
    APPLE_API_ISSUER: '11111111-2222-3333-4444-555555555555'
  }

  it('skips non-mac platforms', () => {
    expect(resolveNotarizeAction({ electronPlatformName: 'win32', env: passwordCredentials })).toEqual({
      action: 'skip',
      reason: 'not-darwin'
    })
  })

  it('prefers the App Store Connect API key used by CCBuddy', () => {
    expect(
      resolveNotarizeAction({
        electronPlatformName: 'darwin',
        env: { ...passwordCredentials, ...apiKeyCredentials }
      })
    ).toEqual({
      action: 'notarize',
      mode: 'api-key',
      appleApiKey: '/tmp/AuthKey.p8',
      appleApiKeyId: 'ABCDE12345',
      appleApiIssuer: '11111111-2222-3333-4444-555555555555'
    })
  })

  it('falls back to an app-specific password', () => {
    expect(resolveNotarizeAction({ electronPlatformName: 'darwin', env: passwordCredentials })).toEqual({
      action: 'notarize',
      mode: 'password',
      appleId: 'dev@example.com',
      appleIdPassword: 'xxxx-xxxx-xxxx-xxxx',
      teamId: 'ABCD123456'
    })
  })

  it('skips a local build that has no Apple credentials', () => {
    expect(resolveNotarizeAction({ electronPlatformName: 'darwin', env: {} })).toEqual({
      action: 'skip',
      reason: 'missing-credentials'
    })
  })

  it('fails CI when Apple credentials are missing', () => {
    expect(() => resolveNotarizeAction({ electronPlatformName: 'darwin', env: { CI: 'true' } })).toThrow(
      /APPLE_API_KEY_PATH/
    )
  })
})

describe('notarizeOptions', () => {
  it('maps API-key decisions onto @electron/notarize', () => {
    expect(
      notarizeOptions('/tmp/Cherry Lite.app', 'com.loadchange.CherryStudioLite', {
        mode: 'api-key',
        appleApiKey: '/tmp/AuthKey.p8',
        appleApiKeyId: 'ABCDE12345',
        appleApiIssuer: '11111111-2222-3333-4444-555555555555'
      })
    ).toEqual({
      appPath: '/tmp/Cherry Lite.app',
      appBundleId: 'com.loadchange.CherryStudioLite',
      appleApiKey: '/tmp/AuthKey.p8',
      appleApiKeyId: 'ABCDE12345',
      appleApiIssuer: '11111111-2222-3333-4444-555555555555'
    })
  })
})
