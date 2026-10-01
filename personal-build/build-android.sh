#!/usr/bin/env bash
# Build the Orca Personal Android APK (its own app ID, installs beside the official app) and
# sign it with the personal release key. Usage: personal-build/build-android.sh [--install]
#   --install  also `adb install -r` it on the one USB-connected phone.
# The key lives outside the repo; losing it means uninstalling before the next update.
set -euo pipefail
cd "$(dirname "$0")/.."

keystore="$HOME/.orca-personal/android/orca-personal-release.jks"
key_alias=orca-personal
keychain_service=orca-personal-android-keystore
out_dir="$HOME/.orca-personal/android/builds"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
# Expo 55 runs on Node 22; the Mac's default Node 26 is newer than the toolchain supports.
[ -d /opt/homebrew/opt/node@22/bin ] && export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
build_tools=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)

[ -f "$keystore" ] || { echo "Missing keystore $keystore (see personal-build/ANDROID.md)"; exit 1; }
store_pass=$(security find-generic-password -a "$USER" -s "$keychain_service" -w)

export ORCA_MOBILE_VARIANT=personal
export ORCA_MOBILE_VERSION_CODE=$(git rev-list --count HEAD)
sha=$(git rev-parse --short HEAD)

cd mobile
pnpm install --frozen-lockfile
npx expo prebuild --platform android --clean --no-install
# Every current Android phone is arm64; one ABI quarters the native build. The default
# metaspace runs out on a cold build and stalls the daemon.
(cd android && ./gradlew --no-daemon -PreactNativeArchitectures=arm64-v8a \
  '-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g' assembleRelease)

version=$(node -p 'require("./app.json").expo.version')
mkdir -p "$out_dir"
apk="$out_dir/orca-personal-$version-$ORCA_MOBILE_VERSION_CODE-$sha.apk"
"$build_tools/apksigner" sign --ks "$keystore" --ks-key-alias "$key_alias" \
  --ks-pass "pass:$store_pass" --key-pass "pass:$store_pass" \
  --out "$apk" android/app/build/outputs/apk/release/app-release.apk
"$build_tools/apksigner" verify "$apk"
rm -f "$apk.idsig"
ln -sf "$(basename "$apk")" "$out_dir/orca-personal-latest.apk"
echo "APK: $apk"

if [ "${1:-}" = --install ]; then
  adb install -r "$apk"
fi
