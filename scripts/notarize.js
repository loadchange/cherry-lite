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

  const appleId = env.APPLE_ID
  const appleIdPassword = env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = env.APPLE_TEAM_ID
  if (appleId && appleIdPassword && teamId) {
    return { action: 'notarize', appleId, appleIdPassword, teamId }
  }

  if (env.CI === 'true') {
    throw new Error('CI macOS builds must notarize. Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID.')
  }

  return { action: 'skip', reason: 'missing-credentials' }
}

exports.resolveAppBundleId = resolveAppBundleId
exports.resolveNotarizeAction = resolveNotarizeAction

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

  await notarize({
    appPath,
    appBundleId,
    appleId: decision.appleId,
    appleIdPassword: decision.appleIdPassword,
    teamId: decision.teamId
  })

  execFileSync('xcrun', ['stapler', 'staple', '-v', appPath], { stdio: 'inherit' })
  console.log('  • Notarized and stapled app:', appPath)
}
