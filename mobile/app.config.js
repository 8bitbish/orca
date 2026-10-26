// Bare expo-notifications defaults to sandbox entitlements while non-dev push-token.ts reports production, silently losing TestFlight/App Store pushes.
// Derive APNs mode from release workflow env; Expo still supplies app.json, including Fastlane version/buildNumber rewrites, for everything else.
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
    // `expo run` installs a dev-client build cached for the current native fingerprint instead of
    // rebuilding; scripts/native-client.mjs populates the cache.
    buildCacheProvider: { plugin: './scripts/native-build-cache.cjs' },
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
