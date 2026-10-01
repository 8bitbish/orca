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

- The self-signed **Orca Personal Build** certificate in the login Keychain, trusted for code
  signing only. Every build must carry the same signature or the updater refuses it; a new
  certificate means one manual reinstall.
- `gh` logged in as `8bitbish`.
- The first switch from the official Orca is manual: install the build's DMG from the fork's
  release once. Updates after that go through the in-app prompt.

## Recreating the signing certificate

If the Keychain loses **Orca Personal Build**, make a new one: a self-signed certificate with
`extendedKeyUsage = critical, codeSigning`, imported into the login Keychain with
`security import <p12> -k ~/Library/Keychains/login.keychain-db -T /usr/bin/codesign`, then in
Keychain Access set its **Trust → Code Signing** to **Always Trust**. The new signature differs,
so install the next build from its release DMG once; updates work again after that.
