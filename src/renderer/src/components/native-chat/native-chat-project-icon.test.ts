import { describe, expect, it } from 'vitest'
import { REPO_COLORS } from '../../../../shared/constants'
import type { RepoIcon } from '../../../../shared/repo-icon'
import {
  nativeChatProjectAppIconLookupAllowed,
  nativeChatProjectMonogram,
  resolveNativeChatProjectIcon
} from './native-chat-project-icon'

const APP_ICON = 'data:image/png;base64,iVBORw0KGgo='
const AVATAR: RepoIcon = {
  type: 'image',
  src: 'https://github.com/3sidedcube-orca.png?size=64',
  source: 'github',
  label: '3sidedcube-orca/orca-rap'
}
const plain = { displayName: 'orca', badgeColor: '#737373' }

describe('resolveNativeChatProjectIcon', () => {
  it("uses the reply's own icon first", () => {
    expect(
      resolveNativeChatProjectIcon({
        payloadIcon: '🖼',
        repo: { ...plain, repoIcon: AVATAR },
        appIconSrc: APP_ICON
      })
    ).toEqual({ kind: 'payload', glyph: '🖼' })
  })

  it('then the icon the sidebar shows for the repo, ahead of any app icon', () => {
    expect(
      resolveNativeChatProjectIcon({
        repo: { displayName: 'orca-rap', badgeColor: '#3b82f6', repoIcon: AVATAR },
        appIconSrc: APP_ICON
      })
    ).toEqual({ kind: 'repo', repoIcon: AVATAR, badgeColor: '#3b82f6' })
    const lucide: RepoIcon = { type: 'lucide', name: 'Rocket' }
    expect(
      resolveNativeChatProjectIcon({ repo: { ...plain, repoIcon: lucide }, appIconSrc: null })
    ).toEqual({ kind: 'repo', repoIcon: lucide, badgeColor: '#737373' })
  })

  it('then the repo app icon, keeping a monogram for when it fails to load', () => {
    expect(
      resolveNativeChatProjectIcon({ repo: { ...plain, repoIcon: null }, appIconSrc: APP_ICON })
    ).toEqual({
      kind: 'app',
      src: APP_ICON,
      fallback: nativeChatProjectMonogram('orca')
    })
  })

  it('then a monogram', () => {
    expect(
      resolveNativeChatProjectIcon({ payloadIcon: '  ', repo: plain, appIconSrc: null })
    ).toEqual({ kind: 'monogram', ...nativeChatProjectMonogram('orca') })
  })
})

describe('nativeChatProjectMonogram', () => {
  it('takes the first letter or digit, upper-cased', () => {
    expect(nativeChatProjectMonogram('orca-personal').letter).toBe('O')
    expect(nativeChatProjectMonogram('  _42things').letter).toBe('4')
    expect(nativeChatProjectMonogram('éclair').letter).toBe('É')
    expect(nativeChatProjectMonogram('---').letter).toBe('?')
  })

  it('hashes the name to a stable, non-neutral repo colour', () => {
    const color = nativeChatProjectMonogram('ImageReview').color
    expect(nativeChatProjectMonogram('imagereview').color).toBe(color)
    expect(REPO_COLORS.slice(1)).toContain(color)
    const spread = new Set(
      ['orca', 'ImageReview', 'Assistant', 'AppPilot', 'Nook', 'FreeFlow'].map(
        (name) => nativeChatProjectMonogram(name).color
      )
    )
    expect(spread.size).toBeGreaterThan(1)
  })
})

describe('nativeChatProjectAppIconLookupAllowed', () => {
  it('looks on disk only for a repo on this machine', () => {
    expect(nativeChatProjectAppIconLookupAllowed({})).toBe(true)
    expect(nativeChatProjectAppIconLookupAllowed({ executionHostId: 'local' })).toBe(true)
  })

  it('skips the lookup when the sidebar already has an icon for the repo', () => {
    expect(nativeChatProjectAppIconLookupAllowed({ repoIcon: AVATAR })).toBe(false)
    expect(nativeChatProjectAppIconLookupAllowed({ repoIcon: null })).toBe(true)
  })

  it('never looks for an SSH or remote-runtime repo, which always gets the monogram', () => {
    expect(nativeChatProjectAppIconLookupAllowed({ connectionId: 'box' })).toBe(false)
    expect(nativeChatProjectAppIconLookupAllowed({ executionHostId: 'ssh:box' })).toBe(false)
    expect(nativeChatProjectAppIconLookupAllowed({ executionHostId: 'runtime:env-1' })).toBe(false)
  })
})
