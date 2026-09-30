# Personal Orca build: decisions and why

Written 2026-09-30 when this setup was built. [README.md](README.md) covers how to use it;
this covers why it is shaped this way, so a later change doesn't undo a reason.

## Goal

Run Orca with Jake's own fixes, keep getting every upstream release, and stop sending PRs
upstream. Upstream releases arrive through Orca's normal "Update available" prompt with
the fixes already applied.

## Shape

| Decision | Why |
| --- | --- |
| One long-lived `personal` branch; fixes are commits on it | No PRs upstream, so per-fix branches only add bookkeeping. `personal:` prefixes keep the fixes findable. |
| Merge upstream into `personal`; never rebase | 3SC's rule: never rewrite git history (no rebase, reset, amend, force-push). Merges also let rerere replay earlier conflict resolutions. |
| Follow stable release tags (`vX.Y.Z`), not upstream `main` | `main` moved ~3,200 commits in six weeks. Releases are fewer, tested merge points. |
| A separate clone at `~/orca-personal` | The job never touches Jake's working worktrees. It was cloned with `--dissociate`, so it shares nothing with any other checkout. |
| Orca's own automation (daily 09:00, precheck) rather than launchd | The precheck makes quiet days free (no agent starts), the run history and Claude session are visible in Orca, and a missed run catches up within 12 hours of Orca opening. |
| Deterministic `sync.sh` plus an agent only for judgement | Routine steps stay predictable; Claude only handles conflicts and failures, following [AGENT.md](AGENT.md). |
| Build and install happen before the prompt | Orca can't replace itself mid-run. Publishing a release and letting the in-app updater install it on click is the normal, tested path. |
| The updater feed points at the `8bitbish/orca` fork | The one constant in `src/main/updater-release-repository.ts`, plus `publish.owner` in the builder config. Upstream's updater tests still run against `stablyai` in `sync.sh` (the constant is swapped temporarily), so they keep catching real behaviour changes. |
| Versions are Orca's own local-build versions (`X.Y.Z-local.<ms>.<commit>`) | They already sort newest-last, and the trailing commit lets `needs-build.sh` tell whether `personal` is published. |

## Signing

- The updater only installs a build carrying the same code identity as the running app. So
  every build must be signed with one stable identity. Ad-hoc signatures change every build.
- The 3SC Developer ID (`3 Sided Cube (UK) Ltd (25H7BM6YWK)`, as AppCaptur uses) was the first
  choice. Its `.p12` (`~/Downloads/appcaptur-developer-id.p12`) has a forgotten password, and
  the only copy of it is the AppCaptur repo's GitHub secret, which can't be read back.
- So builds use a self-signed **Orca Personal Build** certificate (login Keychain, trusted for
  Code Signing only, valid to 2036). Its designated requirement is
  `identifier "com.stablyai.orca" and certificate leaf = H"33a37f0f…f451"`, identical for
  every build. Verified end to end: an isolated build A updated itself to build B through the
  real updater (`verify-update.cjs`).
- Switching identity (to the 3SC cert, or a recreated self-signed one) breaks the updater once:
  install that build from its DMG by hand, then updates work again.
- electron-builder only uses identities listed by `security find-identity -v`, so the
  certificate must be *trusted* for code signing, not just imported.

## What changed from the original chat-order PR (#15609)

The fix was written on 2026-08-18 against v1.4.184 and ported to v1.4.217:

- Desktop ordering (idle echo → streaming reply → queued echo) kept. Upstream had moved the
  send code into `NativeChatResolvedView.tsx`, so it was re-applied there.
- The streaming-preview gate keeps upstream's `previewIsToolOutput` alongside `hasOpenIdleSend`.
- Mobile keeps upstream's baseline anchoring (#16117). Only unanchored idle echoes go before the
  streaming bubble, and queued echoes at the tail go after it.
- The prepend scroll-anchor repair was dropped: upstream replaced that mechanism with the
  virtualized transcript window.
- The e2e spec reads rows as `[data-native-chat-window] > [data-index]`. It passes with the fix
  and fails with the old ranking.

## Things specific to this Mac

- **pnpm:** pnpm's self-switch left pnpm 12 without its native binary. The scripts run the pinned
  version through `npx` (`personal_build_use_pinned_pnpm`), and git hooks need that PATH too.
- **Case-insensitive filesystem:** upstream and the fork have branch names that differ only in
  case. The upstream remote fetches tags only (`+refs/tags/v*:refs/tags/v*`), and the fork is
  never fetched, only pushed to.
- **Swift 6.4 (macOS 27)** writes every `--triple` to one shared bin dir, which broke
  `build-computer-macos.mjs`. It now stages each slice (commit `66e392a94d`).
- **Both architectures:** `build:mac` packages x64 and arm64, so the sync installs with
  `pnpm install:release`.
- **pipefail:** `cmd | grep -q` fails spuriously (SIGPIPE), so the scripts grep captured output.
- **Isolated test launches:** a packaged Orca started with a temp `HOME` makes macOS prompt
  "Keychain Not Found". Pass `--use-mock-keychain`, and answer Cancel if it appears anyway.

## Re-checking the updater

After an upstream change to the updater or signing, prove A → B again:

1. `ditto dist/mac-arm64/Orca.app /tmp/orca-A/Orca.app` from a published build.
2. Commit something and let `sync.sh` publish build B.
3. `PLAYWRIGHT_PATH=$(node -p 'require.resolve("playwright")') node personal-build/verify-update.cjs /tmp/orca-A/Orca.app`

It launches A isolated (temp HOME and userData, mock Keychain), runs check → download →
install, and exits 0 once the bundle on disk is B. Jake's running Orca is not touched: if the
updated copy relaunches, the single-instance lock hands off to it.
