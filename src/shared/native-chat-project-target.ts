// Which workspace a project chip or card names. A target is `repo/displayName`,
// a bare `repo` (its main workspace), or a worktree id (`repoId::path`). An
// ambiguous or unknown target resolves to nothing, so the reply never points at
// the wrong workspace.

// Shared by desktop and mobile, so it reads only the fields both rows carry.

export const NATIVE_CHAT_WORKTREE_LINK_SCHEME = 'orca-worktree:'

export type NativeChatProjectRepoRow = {
  id: string
  displayName: string
  /** Absent on mobile, whose catalog does not carry repo paths. */
  path?: string
}

export type NativeChatProjectWorktreeRow = {
  id: string
  repoId: string
  displayName: string
  branch?: string
  path: string
  isMainWorktree?: boolean
  isArchived?: boolean
}

export type NativeChatProjectTarget<
  R extends NativeChatProjectRepoRow = NativeChatProjectRepoRow,
  W extends NativeChatProjectWorktreeRow = NativeChatProjectWorktreeRow
> = { repo: R; worktree: W }

/** The target named by an `orca-worktree:` href, or null for any other link. */
export function parseNativeChatWorktreeHref(href: string | undefined): string | null {
  const trimmed = href?.trim()
  if (!trimmed || !trimmed.toLowerCase().startsWith(NATIVE_CHAT_WORKTREE_LINK_SCHEME)) {
    return null
  }
  const raw = trimmed.slice(NATIVE_CHAT_WORKTREE_LINK_SCHEME.length).replace(/^\/\//, '')
  try {
    const decoded = decodeURIComponent(raw).trim()
    return decoded === '' ? null : decoded
  } catch {
    return null
  }
}

function lastPathSegment(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? ''
}

function shortBranch(branch: string | undefined): string {
  return (branch ?? '').replace(/^refs\/heads\//, '')
}

function same(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
}

/** The single match, preferring a live workspace over an archived one. */
function onlyMatch<T extends { isArchived?: boolean }>(matches: T[]): T | null {
  if (matches.length === 1) {
    return matches[0]
  }
  const live = matches.filter((match) => !match.isArchived)
  return live.length === 1 ? live[0] : null
}

function findRepo<R extends NativeChatProjectRepoRow>(name: string, repos: readonly R[]): R | null {
  const byName = repos.filter((repo) => same(repo.displayName, name))
  if (byName.length > 0) {
    return byName.length === 1 ? byName[0] : null
  }
  const byFolder = repos.filter(
    (repo) => repo.path !== undefined && same(lastPathSegment(repo.path), name)
  )
  return byFolder.length === 1 ? byFolder[0] : null
}

function findWorktree<W extends NativeChatProjectWorktreeRow>(
  name: string | null,
  worktrees: readonly W[]
): W | null {
  if (name === null) {
    // A folder project has exactly one workspace, which git never calls "main".
    return onlyMatch(
      worktrees.length === 1 ? [...worktrees] : worktrees.filter((w) => w.isMainWorktree)
    )
  }
  for (const matches of [
    worktrees.filter((worktree) => same(worktree.displayName, name)),
    worktrees.filter((worktree) => same(shortBranch(worktree.branch), name)),
    worktrees.filter((worktree) => same(lastPathSegment(worktree.path), name))
  ]) {
    if (matches.length > 0) {
      return onlyMatch(matches)
    }
  }
  return null
}

export function resolveNativeChatProjectTarget<
  R extends NativeChatProjectRepoRow,
  W extends NativeChatProjectWorktreeRow
>(
  target: string,
  repos: readonly R[],
  worktreesByRepo: Readonly<Record<string, readonly W[]>>
): NativeChatProjectTarget<R, W> | null {
  const trimmed = target.trim()
  if (trimmed === '') {
    return null
  }
  if (trimmed.includes('::')) {
    const rows = Object.values(worktreesByRepo)
      .flat()
      .filter((worktree) => worktree.id === trimmed)
    const worktree = rows.length === 1 ? rows[0] : null
    const repo = worktree ? repos.find((candidate) => candidate.id === worktree.repoId) : undefined
    return worktree && repo ? { repo, worktree } : null
  }
  // Repo names rarely hold a slash and branch-style workspace names often do.
  const slash = trimmed.indexOf('/')
  const repoName = slash === -1 ? trimmed : trimmed.slice(0, slash).trim()
  const worktreeName = slash === -1 ? null : trimmed.slice(slash + 1).trim() || null
  const repo = findRepo(repoName, repos)
  if (!repo) {
    return null
  }
  const worktree = findWorktree(worktreeName, worktreesByRepo[repo.id] ?? [])
  return worktree ? { repo, worktree } : null
}

/** The workspace's name when it is not the project's main one. */
export function nativeChatProjectWorkspaceLabel(target: NativeChatProjectTarget): string | null {
  if (target.worktree.isMainWorktree) {
    return null
  }
  const name = target.worktree.displayName.trim()
  return name === '' || same(name, target.repo.displayName) ? null : name
}
