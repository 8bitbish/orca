import { describe, expect, it } from 'vitest'
import {
  nativeChatProofCheckTone,
  nativeChatProofComparePair,
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

describe('nativeChatProofComparePair', () => {
  const image = (role?: 'before' | 'after') => ({
    type: 'image' as const,
    path: 'a.png',
    source: 'a.png',
    ...(role ? { role } : {})
  })

  it('pairs exactly one before with one after', () => {
    const before = image('before')
    const after = image('after')
    expect(nativeChatProofComparePair([image(), before, after])).toEqual({
      before,
      after
    })
  })

  it('does not pair two befores or a lone after', () => {
    expect(
      nativeChatProofComparePair([image('before'), image('before'), image('after')])
    ).toBeNull()
    expect(nativeChatProofComparePair([image('after')])).toBeNull()
  })
})
