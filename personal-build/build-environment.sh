# Sourced by the personal-build scripts. Puts the pnpm version package.json pins on PATH:
# pnpm's self-switch on this Mac leaves newer versions without their native binary, and
# npx installs them fully.

PERSONAL_BUILD_FORK=8bitbish/orca
# Self-signed, login Keychain, trusted for code signing only. Every build must carry the same
# identity or the updater refuses it, so replacing it means one manual reinstall.
PERSONAL_BUILD_SIGNING_IDENTITY='Orca Personal Build'

personal_build_use_pinned_pnpm() {
  local version bin
  version=$(node -p 'require("./package.json").packageManager.split("@")[1].split("+")[0]')
  bin=$(npx -y -p "pnpm@$version" -c 'command -v pnpm')
  export PATH="$(dirname "$bin"):$PATH"
}

# Newest stable (non-rc) upstream release tag.
personal_build_latest_upstream_tag() {
  git tag -l 'v*' | command grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1
}

# Tag of the newest build published to the fork, or empty.
personal_build_latest_published_tag() {
  gh release list --repo "$PERSONAL_BUILD_FORK" --limit 1 --json tagName --jq '.[0].tagName // ""'
}

personal_build_notify() {
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}
