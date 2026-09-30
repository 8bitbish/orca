# Personal Orca build: automation instructions

You are keeping `personal` (upstream Orca releases + Jake's own fixes) built and published.
The Orca automation "Orca personal update" starts you when `personal-build/needs-build.sh`
finds work. Everything happens in this checkout (`~/orca-personal`).

## Run

```sh
personal-build/sync.sh
```

It prints a `STOPPED (<code>)` line when it needs you. Act on the code, then run it again —
finished stages are skipped. Repeat until it prints `Published v...` or `Nothing to do`.

| Code | Meaning | What to do |
| ---- | ------- | ---------- |
| 10 | Merge conflicts | Resolve them (below), `git add` the files, run sync again. It commits the merge. |
| 11 | Install, type check or tests failed | Fix only if the failure comes from a personal change meeting the new upstream code. Commit as `personal: <what>`, run sync again. One attempt; if it still fails, stop and report. |
| 12 | Build or signing failed | A missing certificate is Jake's to fix — report it. Otherwise investigate once. |
| 13 | Push or release failed | Check `gh auth status` and the network, retry once, then report. |

## Resolving conflicts

- Keep upstream's new behaviour **and** the personal fix. The personal changes are
  `git log --no-merges --format='%h %s' $(personal_build_latest_upstream_tag)..personal`
  (source `personal-build/build-environment.sh` first) — commits prefixed `personal:` plus
  the native-chat reply-order fix.
- When upstream restructured the code, re-apply the personal change where the code now
  lives instead of reviving the old structure.
- If upstream now does the same thing as a personal fix, keep upstream's version and say so
  in the report.
- Git's rerere is on; earlier resolutions replay automatically.
- `src/main/updater-release-repository.ts` must keep `UPDATER_RELEASE_OWNER = '8bitbish'`.
- If a conflict cannot be resolved with confidence, run `git merge --abort` and report.
  Jake's installed Orca stays as it is.

## Rules

- Never rewrite history: no rebase, reset, amend or force-push. Merges and new commits only.
- Never disable lint rules (including `max-lines`) or skip hooks.
- Before running `pnpm` yourself: `source personal-build/build-environment.sh && personal_build_use_pinned_pnpm`.

## Report

End with a short summary: the upstream release merged, what conflicted and how you resolved
it, and whether a build was published (with its version).
