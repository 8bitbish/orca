# Orca Personal for Android

The mobile app (`mobile/`) built from `personal` as **Orca Personal**, app ID
`com.stably.orca.mobile.personal`. It installs beside the official Orca app instead of
clashing with its signature. The variant lives in `mobile/app.config.js`
(`ORCA_MOBILE_VARIANT=personal`).

## Build

```bash
personal-build/build-android.sh            # build + sign
personal-build/build-android.sh --install  # also adb install -r on the USB phone
```

Output: `~/.orca-personal/android/builds/orca-personal-<version>-<versionCode>-<sha>.apk`,
plus an `orca-personal-latest.apk` link. The version code is the commit count of `HEAD`, so
each build installs over the last.

Toolchain (nothing extra installed): Android Studio's bundled JDK 21, the SDK at
`~/Library/Android/sdk` (platform 36, build-tools 36, NDK 27.1), Node 22 from
`/opt/homebrew/opt/node@22`. The script sets `JAVA_HOME`, `ANDROID_HOME` and `PATH` itself.

Disk: the script deletes the generated `mobile/android` (~1 GB) after each build. Gradle keeps
~3 GB in `~/.gradle/caches/9.0.0` and `~/.gradle/wrapper/dists/gradle-9.0.0-bin`; with it a
rebuild takes ~3 minutes, without it the next build re-downloads and takes ~10. Delete both to
reclaim the space. `mobile/node_modules` (~2.7 GB, mostly hard links into the pnpm store) is
reinstalled by the script in under a minute.

## Signing key

- Keystore: `~/.orca-personal/android/orca-personal-release.jks` (alias `orca-personal`),
  never in the repo.
- Password: login Keychain, service `orca-personal-android-keystore`
  (`security find-generic-password -s orca-personal-android-keystore -w`).
- Back both up. Android only installs an update signed with the same key, so a lost key
  means uninstalling Orca Personal (and re-pairing) before the next build will install.

## Install on the phone

**USB:** enable Developer options → USB debugging, plug in, accept the prompt, then
`adb install -r ~/.orca-personal/android/builds/orca-personal-latest.apk`.

**Sideload:** get the APK onto the phone (AirDrop-style share, Google Drive, a GitHub release
download), tap it, and allow "Install unknown apps" for the app that opened it.

Then pair from Orca desktop → Settings → Mobile, as with the official app.

## What differs from the official app

- **No push notifications.** The bundled `google-services.json` is registered for the
  official package only, so the personal build ships without Firebase and the app falls back
  to no push token. Fixing this needs a Firebase project of our own, and the desktop's push
  gateway is Orca's cloud service, which only holds credentials for the official app.
- **`orca://` links** are claimed by both apps when both are installed; Android asks which
  app to open. Scanning the pairing QR inside the app is unaffected.
- **Update prompt** reads `8bitbish/orca` tags named `mobile-android-personal-v<version>`
  instead of the official feed, so it never offers the official APK. Until such releases are
  published it always reports "up to date".
