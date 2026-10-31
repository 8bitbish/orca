# Sourced by the personal-build scripts. Puts the pnpm version package.json pins on PATH:
# pnpm's self-switch on this Mac leaves newer versions without their native binary, and
# npx installs them fully.

PERSONAL_BUILD_FORK=8bitbish/orca
# SHA-1 of Jake's free Personal Team cert, "Apple Development: jakesb1996@gmail.com (RW2P4952GD)",
# Team B6A3H43795. The Team ID keeps keychain access ("orca Safe Storage") across builds without a
# prompt. By hash: another "Apple Development:" identity is in the keychain. Every build must carry
# the same identity or the updater refuses it, so replacing it means one manual reinstall.
PERSONAL_BUILD_SIGNING_IDENTITY='A8871A7396236A77AD3788E5E2FAC717D0FD9C84'

personal_build_has_signing_identity() {
  local identities
  # Capture first: under pipefail, grep -q exiting early fails the pipeline.
  identities=$(security find-identity -v -p codesigning)
  command grep -qF " $PERSONAL_BUILD_SIGNING_IDENTITY " <<<"$identities"
}

# SHA-1 of the leaf certificate that signed $1, uppercase.
personal_build_signer_sha1() {
  local dir sha=''
  dir=$(mktemp -d) || return 1
  codesign -d --extract-certificates="$dir/cert" "$1" 2>/dev/null &&
    sha=$(shasum -a 1 "$dir/cert0" | awk '{ print toupper($1) }')
  rm -rf "${dir:?}"
  echo "$sha"
}

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
