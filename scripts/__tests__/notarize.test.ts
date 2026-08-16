import { describe, expect, it } from 'vitest'

import { resolveAppBundleId, resolveNotarizeAction } from '../notarize'

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
  const credentials = {
    APPLE_ID: 'dev@example.com',
    APPLE_APP_SPECIFIC_PASSWORD: 'xxxx-xxxx-xxxx-xxxx',
    APPLE_TEAM_ID: 'ABCD123456'
  }

  it('skips non-mac platforms', () => {
    expect(resolveNotarizeAction({ electronPlatformName: 'win32', env: credentials })).toEqual({
      action: 'skip',
      reason: 'not-darwin'
    })
  })

  it('notarizes when Apple credentials are present', () => {
    expect(resolveNotarizeAction({ electronPlatformName: 'darwin', env: credentials })).toEqual({
      action: 'notarize',
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
    expect(() => resolveNotarizeAction({ electronPlatformName: 'darwin', env: { CI: 'true' } })).toThrow(/APPLE_ID/)
  })
})
