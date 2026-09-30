# Personal Orca build

`personal` = the newest stable upstream Orca release + Jake's fixes, rebuilt and published
to [8bitbish/orca releases](https://github.com/8bitbish/orca/releases). This build's in-app
updater reads that feed, so each rebuild arrives as Orca's normal "Update available" prompt.

## How an update flows

1. The Orca automation **Orca personal update** runs daily. Its precheck,
   `needs-build.sh`, skips the run unless there is a new upstream release, an open merge, or
   unpublished personal commits.
2. When there is work, a Claude session runs `sync.sh` and follows [AGENT.md](AGENT.md):
   merge → type check + tests → signed `pnpm build:mac` → push `personal` → GitHub release.
   Conflicts and failures stop the script with a code the agent acts on.
3. A notification says the build is ready; Orca's update prompt installs it.

Logs: `~/Library/Logs/orca-personal-sync/`. Run history: Orca → Automations.

## Adding a fix

Commit it on `personal` with a `personal:` prefix. The next run sees an unpublished commit
and rebuilds. To build immediately: `orca automations run <id>` or run `sync.sh` yourself.

## Requirements

- The `Developer ID Application: 3 Sided Cube (UK) Ltd (25H7BM6YWK)` certificate in the
  login Keychain. Every build must carry the same signature or the updater refuses it.
- `gh` logged in as `8bitbish`.
- The first switch from the official Orca is manual: install the build's DMG from the fork's
  release once. Updates after that go through the in-app prompt.
