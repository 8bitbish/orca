import { describe, expect, it } from 'vitest'
import { REPO_COLORS } from '../../../../shared/constants'
import {
  nativeChatProjectAppIconLookupAllowed,
  nativeChatProjectMonogram,
  resolveNativeChatProjectIcon
} from './native-chat-project-icon'

const APP_ICON = 'data:image/png;base64,iVBORw0KGgo='

describe('resolveNativeChatProjectIcon', () => {
  it("uses the reply's own icon first", () => {
    expect(
      resolveNativeChatProjectIcon({ payloadIcon: '🖼', appIconSrc: APP_ICON, repoName: 'Images' })
    ).toEqual({ kind: 'payload', glyph: '🖼' })
  })

  it('then the repo app icon, keeping a monogram for when it fails to load', () => {
    expect(resolveNativeChatProjectIcon({ appIconSrc: APP_ICON, repoName: 'orca' })).toEqual({
      kind: 'app',
      src: APP_ICON,
      fallback: nativeChatProjectMonogram('orca')
    })
  })

  it('then a monogram', () => {
    expect(
      resolveNativeChatProjectIcon({ payloadIcon: '  ', appIconSrc: null, repoName: 'orca' })
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

  it('never looks for an SSH or remote-runtime repo, which always gets the monogram', () => {
    expect(nativeChatProjectAppIconLookupAllowed({ connectionId: 'box' })).toBe(false)
    expect(nativeChatProjectAppIconLookupAllowed({ executionHostId: 'ssh:box' })).toBe(false)
    expect(nativeChatProjectAppIconLookupAllowed({ executionHostId: 'runtime:env-1' })).toBe(false)
  })
})
