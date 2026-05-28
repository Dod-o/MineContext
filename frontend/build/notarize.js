const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    const message = 'Apple notarization credentials are missing; macOS release artifacts would fail Gatekeeper.'
    if (process.env.GITHUB_ACTIONS === 'true') {
      throw new Error(message)
    }
    console.warn(message)
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`

  console.log('Notarizing app:', appPath)

  await notarize({
    appPath,
    appBundleId: 'com.vikingdb.desktop',
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  })

  console.log('Notarized app:', appPath)
}
