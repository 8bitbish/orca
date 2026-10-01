import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { makeWorktree } from '../../store/slices/store-test-helpers'
import {
  nativeChatProjectWorkspaceLabel,
  parseNativeChatWorktreeHref,
  resolveNativeChatProjectTarget
} from './native-chat-project-target'

function repo(id: string, displayName: string, path = `/code/${displayName}`): Repo {
  return { id, path, displayName, badgeColor: '#737373', addedAt: 0 }
}

const orca = repo('repo-orca', 'orca-personal')
const images = repo('repo-images', 'ImageReview')
const orcaMain = makeWorktree({
  id: 'repo-orca::/code/orca-personal',
  repoId: orca.id,
  path: '/code/orca-personal',
  branch: 'refs/heads/main',
  displayName: 'orca-personal',
  isMainWorktree: true
})
const orcaPersonal = makeWorktree({
  id: 'repo-orca::/code/ws/personal',
  repoId: orca.id,
  path: '/code/ws/personal',
  branch: 'refs/heads/jake/personal',
  displayName: 'personal'
})
const imagesPackaging = makeWorktree({
  id: 'repo-images::/code/ws/packaging',
  repoId: images.id,
  path: '/code/ws/packaging',
  branch: 'refs/heads/fix/packaging',
  displayName: 'packaging'
})
const repos = [orca, images]
const worktreesByRepo = { [orca.id]: [orcaMain, orcaPersonal], [images.id]: [imagesPackaging] }

describe('parseNativeChatWorktreeHref', () => {
  it('reads the target of an orca-worktree link, decoding it', () => {
    expect(parseNativeChatWorktreeHref('orca-worktree:orca-personal/personal')).toBe(
      'orca-personal/personal'
    )
    expect(parseNativeChatWorktreeHref('ORCA-WORKTREE:My%20Repo/main')).toBe('My Repo/main')
    expect(parseNativeChatWorktreeHref('orca-worktree://orca-personal')).toBe('orca-personal')
  })

  it('ignores other links and empty or malformed targets', () => {
    expect(parseNativeChatWorktreeHref('https://example.com')).toBeNull()
    expect(parseNativeChatWorktreeHref('orca-worktree:')).toBeNull()
    expect(parseNativeChatWorktreeHref('orca-worktree:%E0%A4%A')).toBeNull()
    expect(parseNativeChatWorktreeHref(undefined)).toBeNull()
  })
})

describe('resolveNativeChatProjectTarget', () => {
  const resolve = (target: string) =>
    resolveNativeChatProjectTarget(target, repos, worktreesByRepo)?.worktree.id ?? null

  it('resolves repo/displayName, case-insensitively', () => {
    expect(resolve('orca-personal/personal')).toBe(orcaPersonal.id)
    expect(resolve('imagereview/Packaging')).toBe(imagesPackaging.id)
  })

  it('falls back to the branch and then the folder name for the workspace', () => {
    expect(resolve('orca-personal/jake/personal')).toBe(orcaPersonal.id)
    expect(resolve('ImageReview/fix/packaging')).toBe(imagesPackaging.id)
  })

  it('resolves a bare repo name to its main workspace', () => {
    expect(resolve('orca-personal')).toBe(orcaMain.id)
  })

  it('resolves a worktree id', () => {
    expect(resolve(imagesPackaging.id)).toBe(imagesPackaging.id)
  })

  it('resolves nothing for an unknown repo or workspace', () => {
    expect(resolve('nope/personal')).toBeNull()
    expect(resolve('orca-personal/nope')).toBeNull()
    expect(resolve('repo-orca::/gone')).toBeNull()
    expect(resolve('  ')).toBeNull()
  })

  it('resolves nothing when the name is ambiguous, rather than guess', () => {
    const twin = repo('repo-twin', 'orca-personal', '/elsewhere/orca-personal')
    expect(
      resolveNativeChatProjectTarget('orca-personal/personal', [...repos, twin], {
        ...worktreesByRepo,
        [twin.id]: []
      })
    ).toBeNull()
  })

  it('prefers a live workspace over an archived one with the same name', () => {
    const archived = makeWorktree({
      id: 'repo-orca::/old/personal',
      repoId: orca.id,
      displayName: 'personal',
      isArchived: true
    })
    expect(
      resolveNativeChatProjectTarget('orca-personal/personal', repos, {
        ...worktreesByRepo,
        [orca.id]: [orcaMain, archived, orcaPersonal]
      })?.worktree.id
    ).toBe(orcaPersonal.id)
  })
})

describe('nativeChatProjectWorkspaceLabel', () => {
  it('names a workspace that is not the main one', () => {
    const main = resolveNativeChatProjectTarget('orca-personal', repos, worktreesByRepo)
    const linked = resolveNativeChatProjectTarget('orca-personal/personal', repos, worktreesByRepo)
    expect(main && nativeChatProjectWorkspaceLabel(main)).toBeNull()
    expect(linked && nativeChatProjectWorkspaceLabel(linked)).toBe('personal')
  })
})
