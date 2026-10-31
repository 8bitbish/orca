# Personal Orca build

`personal` = the newest stable upstream Orca release + Jake's fixes, rebuilt and published
to [8bitbish/orca releases](https://github.com/8bitbish/orca/releases). This build's in-app
updater reads that feed, so each rebuild arrives as Orca's normal "Update available" prompt.
Why it is built this way: [DECISIONS.md](DECISIONS.md).

## How an update flows

1. The Orca automation **Orca personal update** runs daily to pick up new upstream releases.
   Its precheck, `needs-build.sh`, skips the run unless there is a new upstream release, an
   open merge, or personal commits nobody published (a safety net; fixes publish at once).
2. When there is work, a Claude session runs `sync.sh` and follows [AGENT.md](AGENT.md):
   merge → type check + tests → signed `pnpm build:mac` → push `personal` → GitHub release.
   Conflicts and failures stop the script with a code the agent acts on.
3. A notification says the build is ready; Orca's update prompt installs it.
4. Just before its report, the session starts `close-session-later.sh`. When the turn ends and
   Orca has saved the report to the run history, the script closes the session's terminal, so
   no idle `claude` is left behind. A failed or blocked run stays open. Orca closes a finished
   run's tab by itself only if nobody opened or typed in it during the run; this covers the
   runs you watched.

Logs: `~/Library/Logs/orca-personal-sync/`. Run history: Orca → Automations.

## Adding a fix

Commit it on `personal` with a `personal:` prefix, then publish straight away with
`personal-build/sync.sh`, following [AGENT.md](AGENT.md). The daily run picks up new upstream
releases, plus anything left unpublished as a safety net.

## Requirements

- Jake's free Personal Team certificate, **Apple Development: jakesb1996@gmail.com (RW2P4952GD)**
  (Team `B6A3H43795`), in the login Keychain; builds pick it by SHA-1
  (`PERSONAL_BUILD_SIGNING_IDENTITY`). Every build must carry the same signature or the updater
  refuses it; a different certificate means one manual reinstall.
- `gh` logged in as `8bitbish`.
- The first switch from the official Orca is manual: install the build's DMG from the fork's
  release once. Updates after that go through the in-app prompt.

## Renewing the signing certificate

The Apple Development certificate lasts a year (this one to 31 Oct 2027). Renew it in Xcode ›
Settings › Accounts › the Personal Team › Manage Certificates › **+** › Apple Development, then put
the new SHA-1 (`security find-identity -v -p codesigning`) in `build-environment.sh`. The name
and Team ID stay the same, so the updater and the keychain keep working without a reinstall or
a prompt. Don't pick the "Apple Development: Team iOS" identity: that's a client's team.
