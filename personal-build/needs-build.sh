#!/usr/bin/env bash
# Automation precheck: exit 0 when there is work for sync.sh (a stable upstream release not
# yet merged, a merge left open, or personal commits not yet published); non-zero skips the run.
set -euo pipefail
cd "$(dirname "$0")/.."
source personal-build/build-environment.sh

if [ -f .git/MERGE_HEAD ]; then
  echo "A previous upstream merge is still open."
  exit 0
fi

# Tags only: upstream has branches differing only in case, which this filesystem can't store.
git fetch -q --no-tags upstream '+refs/tags/v*:refs/tags/v*'
latest=$(personal_build_latest_upstream_tag)
if ! git merge-base --is-ancestor "$latest" personal; then
  echo "Upstream $latest is not merged into personal yet."
  exit 0
fi

if ! published=$(personal_build_latest_published_tag); then
  echo "Could not read the fork's releases; skipping this run."
  exit 1
fi
# Local build versions end in .<commit>, so the newest release names the commit it was built from.
published_commit=${published##*.}
if [ -z "$published" ] || [[ "$(git rev-parse personal)" != "$published_commit"* ]]; then
  echo "personal has commits not published yet (last release: ${published:-none})."
  exit 0
fi

echo "Up to date: $published contains upstream $latest."
exit 1
