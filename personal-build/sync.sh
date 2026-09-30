#!/usr/bin/env bash
# Merge the newest stable upstream Orca release into `personal`, verify it, build a signed
# Mac app, and publish it to the fork's releases so Orca's in-app updater offers it.
# Re-runnable: finished stages are skipped. Exit codes the automation agent acts on:
#   10 merge conflicts to resolve   11 verification failed   12 build failed   13 publish failed
set -euo pipefail
shopt -s nullglob
cd "$(dirname "$0")/.."
source personal-build/build-environment.sh

log_dir="$HOME/Library/Logs/orca-personal-sync"
mkdir -p "$log_dir"
log="$log_dir/$(date +%Y-%m-%d_%H%M%S).log"
exec > >(tee -a "$log") 2>&1

lock=.git/personal-sync.lock
if ! mkdir "$lock" 2>/dev/null; then
  echo "Another sync is running (remove $lock if it is stale)."
  exit 1
fi
trap 'rmdir "$lock" 2>/dev/null || true' EXIT

stage() { printf '\n==> %s\n' "$*"; }
stop() {
  echo "STOPPED ($2): $1"
  echo "Log: $log"
  personal_build_notify "Orca personal build stopped" "$1"
  exit "$2"
}
unmerged() { git diff --name-only --diff-filter=U; }

stage "Preflight"
[ "$(git branch --show-current)" = personal ] || stop "Not on the personal branch." 1
personal_build_use_pinned_pnpm
git fetch -q upstream --tags
upstream_tag=$(personal_build_latest_upstream_tag)
echo "Newest stable upstream release: $upstream_tag"

stage "Merge"
if [ -f .git/MERGE_HEAD ]; then
  [ -z "$(unmerged)" ] || stop "Unresolved conflicts: $(unmerged | tr '\n' ' ')" 10
  if git diff --cached | command grep -qE '^\+(<<<<<<<|>>>>>>>) '; then
    stop "Conflict markers are still staged." 10
  fi
  git commit -q --no-edit
  echo "Committed the resolved merge."
elif ! git diff --quiet || ! git diff --cached --quiet; then
  stop "Working tree has uncommitted changes." 1
elif git merge-base --is-ancestor "$upstream_tag" HEAD; then
  echo "Already contains $upstream_tag."
else
  if ! git merge -q --no-ff -m "Merge upstream $upstream_tag into personal" "$upstream_tag"; then
    # rerere may have replayed every earlier resolution; only genuinely new conflicts stop here.
    [ -z "$(unmerged)" ] || stop "Merging $upstream_tag conflicts in: $(unmerged | tr '\n' ' ')" 10
    git commit -q --no-edit
    echo "Merged $upstream_tag using recorded resolutions."
  else
    echo "Merged $upstream_tag cleanly."
  fi
fi

published=$(personal_build_latest_published_tag) || stop "Could not read the fork's releases." 13
if [ -n "$published" ] && [[ "$(git rev-parse HEAD)" == "${published##*.}"* ]]; then
  echo "HEAD is already published as $published. Nothing to do."
  exit 0
fi

stage "Install dependencies"
# Both architectures: build:mac packages x64 and arm64.
pnpm install:release || stop "pnpm install:release failed." 11

stage "Verify"
pnpm typecheck || stop "Type check failed." 11
npx vitest run --config config/vitest.config.ts \
  src/renderer/src/components/native-chat src/shared/native-chat ||
  stop "Native chat tests failed." 11
# Upstream's updater tests pin its own release URLs; run them against that owner so they
# still catch behaviour changes, then restore the fork owner.
feed_constant=src/main/updater-release-repository.ts
sed -i '' "s/UPDATER_RELEASE_OWNER = '[^']*'/UPDATER_RELEASE_OWNER = 'stablyai'/" "$feed_constant"
updater_tests_status=0
npx vitest run --config config/vitest.config.ts src/main/updater src/main/updater. src/main/updater- ||
  updater_tests_status=$?
git checkout -q -- "$feed_constant"
[ "$updater_tests_status" -eq 0 ] || stop "Updater tests failed." 11

stage "Build"
security find-identity -v -p codesigning | command grep -q "$PERSONAL_BUILD_SIGNING_TEAM" ||
  stop "Signing certificate for team $PERSONAL_BUILD_SIGNING_TEAM is not in the login Keychain." 12
rm -rf dist
CSC_NAME="$PERSONAL_BUILD_SIGNING_IDENTITY" pnpm build:mac || stop "pnpm build:mac failed." 12
manifest=dist/latest-mac.yml
[ -f "$manifest" ] || stop "Build produced no $manifest." 12
app=$(ls -d dist/mac-arm64/*.app | head -1)
codesign -dv "$app" 2>&1 | command grep -q "TeamIdentifier=$PERSONAL_BUILD_SIGNING_TEAM" ||
  stop "$app is not signed by team $PERSONAL_BUILD_SIGNING_TEAM." 12

stage "Publish"
version=$(awk '/^version:/ { print $2; exit }' "$manifest")
# The updater's readiness probe requires every asset the manifest names to be downloadable.
assets=("$manifest")
while read -r name; do
  assets+=("dist/$name" "dist/$name.blockmap")
done < <(awk '/^ *- url:/ { print $3 }' "$manifest")
for asset in "${assets[@]}"; do
  [ -f "$asset" ] || stop "Missing release asset $asset." 13
done
git push -q origin personal || stop "Pushing personal to the fork failed." 13
notes="Upstream $upstream_tag plus the personal commits:
$(git log --no-merges --format='- %s' "$upstream_tag"..HEAD)"
gh release create "v$version" "${assets[@]}" --repo "$PERSONAL_BUILD_FORK" \
  --target "$(git rev-parse HEAD)" --title "Orca $version (personal)" --notes "$notes" --latest ||
  stop "Creating release v$version failed." 13

echo "Published v$version. Orca will offer it on its next update check."
personal_build_notify "Orca personal build ready" "v$version (upstream $upstream_tag). Update from Orca to install."
