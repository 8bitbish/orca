// A project's icon in a chat chip or card: the reply's own `icon`, then the repo
// icon the sidebar shows (custom, favicon or provider avatar, persisted on the
// repo), then the app icon found in the repo on this machine, then a monogram on
// a colour hashed from the repo name. Remote repos never look on disk: their
// files live on another host, and a same-named local path would be another
// project's icon. Their persisted repo icon is still used.

import { REPO_COLORS } from '../../../../shared/constants'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { RepoIcon } from '../../../../shared/repo-icon'
import type { Repo } from '../../../../shared/repo-types'

export type NativeChatProjectIconSource =
  | { kind: 'payload'; glyph: string }
  | { kind: 'repo'; repoIcon: RepoIcon; badgeColor: string }
  | { kind: 'app'; src: string; fallback: NativeChatProjectMonogram }
  | ({ kind: 'monogram' } & NativeChatProjectMonogram)

export type NativeChatProjectMonogram = { letter: string; color: string }

// The neutral first entry is the "no colour" badge; a monogram should carry one.
const MONOGRAM_COLORS = REPO_COLORS.slice(1)

function hashName(name: string): number {
  // FNV-1a: stable across sessions and machines, so a repo keeps its colour.
  let hash = 0x811c9dc5
  for (const char of name.toLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function nativeChatProjectMonogram(repoName: string): NativeChatProjectMonogram {
  const letter = Array.from(repoName.trim()).find((char) => /[\p{L}\p{N}]/u.test(char))
  return {
    letter: letter ? letter.toLocaleUpperCase() : '?',
    color: MONOGRAM_COLORS[hashName(repoName.trim()) % MONOGRAM_COLORS.length]
  }
}

/** Only a repo with no sidebar icon whose files are on this machine is searched
 *  for an app icon. */
export function nativeChatProjectAppIconLookupAllowed(
  repo: Pick<Repo, 'connectionId' | 'executionHostId' | 'repoIcon'>
): boolean {
  return (
    !repo.repoIcon && !repo.connectionId && getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
  )
}

export function resolveNativeChatProjectIcon(args: {
  payloadIcon?: string
  repo: Pick<Repo, 'displayName' | 'repoIcon' | 'badgeColor'>
  appIconSrc: string | null
}): NativeChatProjectIconSource {
  const glyph = args.payloadIcon?.trim()
  if (glyph) {
    return { kind: 'payload', glyph }
  }
  if (args.repo.repoIcon) {
    return { kind: 'repo', repoIcon: args.repo.repoIcon, badgeColor: args.repo.badgeColor }
  }
  const repoName = args.repo.displayName
  const monogram = nativeChatProjectMonogram(repoName)
  if (args.appIconSrc) {
    return { kind: 'app', src: args.appIconSrc, fallback: monogram }
  }
  return { kind: 'monogram', ...monogram }
}
