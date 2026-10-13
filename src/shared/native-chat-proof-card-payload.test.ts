import { describe, expect, it } from 'vitest'
import {
  nativeChatProofCheckTone,
  nativeChatProofComparePairs,
  normalizeNativeChatProofMediaPath
} from './native-chat-proof-card-payload'

const BUNDLE = '/Users/someone/.orca-personal/proof/grid-collage/2026-10-04-switch'

describe('normalizeNativeChatProofMediaPath', () => {
  it.each([
    [`${BUNDLE}/flow.mp4`, 'video', 'grid-collage/2026-10-04-switch/flow.mp4'],
    ['~/.orca-personal/proof/_fixture/after.png', 'image', '_fixture/after.png'],
    ['_fixture/before.PNG', 'image', '_fixture/before.PNG']
  ] as const)('%s → %s', (input, type, expected) => {
    expect(normalizeNativeChatProofMediaPath(input, type)).toBe(expected)
  })

  it.each([
    ['/Users/someone/Desktop/shot.png', 'image'],
    [`${BUNDLE}/../../../../.ssh/id_rsa.png`, 'image'],
    [`${BUNDLE}/flow.mp4`, 'image'],
    [`${BUNDLE}/notes.txt`, 'image'],
    ['', 'image']
  ] as const)('refuses %s as %s', (input, type) => {
    expect(normalizeNativeChatProofMediaPath(input, type)).toBeNull()
  })
})

describe('nativeChatProofCheckTone', () => {
  it.each([
    ['73/73 pass', 'pass'],
    ['passed', 'pass'],
    ['✓', 'pass'],
    ['72/73 pass', 'fail'],
    ['1 failed', 'fail'],
    ['0 failed, 12 passed', 'pass'],
    ['Type errors', 'fail'],
    ['not checked', 'unchecked'],
    ['Not tested (no device)', 'unchecked'],
    ['skipped', 'unchecked'],
    ['iPhone 15 simulator', 'neutral']
  ] as const)('%s reads as %s', (result, tone) => {
    expect(nativeChatProofCheckTone(result)).toBe(tone)
  })
})

describe('nativeChatProofComparePairs', () => {
  const image = (role?: 'before' | 'after', path = 'a.png') => ({
    type: 'image' as const,
    path,
    source: path,
    ...(role ? { role } : {})
  })

  it('pairs one before with one after', () => {
    const before = image('before')
    const after = image('after')
    expect(nativeChatProofComparePairs([image(), before, after])).toEqual([{ before, after }])
  })

  it('pairs the nth before with the nth after, in card order', () => {
    const b1 = image('before', 'b1.png')
    const a1 = image('after', 'a1.png')
    const b2 = image('before', 'b2.png')
    const a2 = image('after', 'a2.png')
    expect(nativeChatProofComparePairs([b1, b2, a1, image(), a2])).toEqual([
      { before: b1, after: a1 },
      { before: b2, after: a2 }
    ])
  })

  it('leaves an image without a partner out of every pair', () => {
    const before = image('before', 'b.png')
    const first = image('after', 'a1.png')
    expect(nativeChatProofComparePairs([before, first, image('after', 'a2.png')])).toEqual([
      { before, after: first }
    ])
    expect(nativeChatProofComparePairs([image('after')])).toEqual([])
    expect(
      nativeChatProofComparePairs([{ ...image('before'), type: 'video' as const }, image('after')])
    ).toEqual([])
  })
})
