// Why this file exists: a bare "expo-notifications" plugin entry writes
// `aps-environment: development` into the iOS entitlements, while push-token.ts
// reports `production` for every non-__DEV__ build. A TestFlight or App Store build
// would then register a production APNs token against a sandbox entitlement, and the
// gateway's pushes would be accepted by Apple and delivered nowhere. Deriving the
// mode from an env var the release workflow sets makes the two agree by construction
// instead of relying on the export step to rewrite the entitlement.
//
// app.json stays the source for everything else: Expo reads it first and hands it to
// this function, so the fastlane version/buildNumber rewrite still flows through.
const APS_ENVIRONMENT =
  process.env.ORCA_IOS_APS_ENVIRONMENT === 'production' ? 'production' : 'development'

// Jake's personal build installs beside the official app, so it needs its own app ID. Its
// Firebase client is registered only for the official package, so it ships without FCM.
const PERSONAL = process.env.ORCA_MOBILE_VARIANT === 'personal'
const PERSONAL_APP_ID = 'com.stably.orca.mobile.personal'

function withPersonalVariant(config) {
  if (!PERSONAL) {
    return config
  }
  const { googleServicesFile: _official, ...android } = config.android ?? {}
  return {
    ...config,
    name: 'Orca Personal',
    ios: { ...config.ios, bundleIdentifier: PERSONAL_APP_ID },
    android: {
      ...android,
      package: PERSONAL_APP_ID,
      // build-android.sh passes a rising code so each build installs over the last.
      versionCode: Number(process.env.ORCA_MOBILE_VERSION_CODE) || android.versionCode
    },
    extra: {
      ...config.extra,
      appUpdateGithub: { repo: '8bitbish/orca', tagPrefix: 'mobile-android-personal-v' }
    }
  }
}

module.exports = ({ config: baseConfig }) => {
  const config = withPersonalVariant(baseConfig)
  return {
    ...config,
    ios: {
      ...config.ios,
      entitlements: { ...config.ios?.entitlements, 'aps-environment': APS_ENVIRONMENT }
    },
    plugins: (config.plugins ?? []).map((plugin) =>
      plugin === 'expo-notifications'
        ? [
            'expo-notifications',
            {
              enableBackgroundRemoteNotifications: true,
              mode: APS_ENVIRONMENT,
              icon: './assets/notification-icon.png'
            }
          ]
        : plugin
    )
  }
}
