require('dotenv').config()
const { execFileSync } = require('node:child_process')

const { notarize } = require('@electron/notarize')

const DEFAULT_APP_BUNDLE_ID = 'com.loadchange.CherryStudioLite'

function resolveAppBundleId(packager) {
  return packager?.appInfo?.id || packager?.config?.appId || DEFAULT_APP_BUNDLE_ID
}

function resolveNotarizeAction({ electronPlatformName, env = process.env } = {}) {
  if (electronPlatformName !== 'darwin') {
    return { action: 'skip', reason: 'not-darwin' }
  }

  const appleApiKey = env.APPLE_API_KEY_PATH || env.APPLE_API_KEY
  const appleApiKeyId = env.APPLE_API_KEY_ID
  const appleApiIssuer = env.APPLE_API_ISSUER
  if (appleApiKey && appleApiKeyId && appleApiIssuer) {
    return { action: 'notarize', mode: 'api-key', appleApiKey, appleApiKeyId, appleApiIssuer }
  }

  const appleId = env.APPLE_ID
  const appleIdPassword = env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = env.APPLE_TEAM_ID
  if (appleId && appleIdPassword && teamId) {
    return { action: 'notarize', mode: 'password', appleId, appleIdPassword, teamId }
  }

  if (env.CI === 'true') {
    throw new Error(
      'CI macOS builds must notarize. Set APPLE_API_KEY_PATH + APPLE_API_KEY_ID + APPLE_API_ISSUER (CCBuddy style), or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID.'
    )
  }

  return { action: 'skip', reason: 'missing-credentials' }
}

function notarizeOptions(appPath, appBundleId, decision) {
  if (decision.mode === 'api-key') {
    return {
      appPath,
      appBundleId,
      appleApiKey: decision.appleApiKey,
      appleApiKeyId: decision.appleApiKeyId,
      appleApiIssuer: decision.appleApiIssuer
    }
  }

  return {
    appPath,
    appBundleId,
    appleId: decision.appleId,
    appleIdPassword: decision.appleIdPassword,
    teamId: decision.teamId
  }
}

exports.resolveAppBundleId = resolveAppBundleId
exports.resolveNotarizeAction = resolveNotarizeAction
exports.notarizeOptions = notarizeOptions

exports.default = async function notarizing(context) {
  const decision = resolveNotarizeAction({
    electronPlatformName: context.electronPlatformName,
    env: process.env
  })
  if (decision.action === 'skip') {
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`
  const appBundleId = resolveAppBundleId(context.packager)

  await notarize(notarizeOptions(appPath, appBundleId, decision))

  execFileSync('xcrun', ['stapler', 'staple', '-v', appPath], { stdio: 'inherit' })
  console.log('  • Notarized and stapled app:', appPath)
}
