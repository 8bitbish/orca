import { describe, expect, it } from 'vitest'
import {
  nativeChatProofCheckTone,
  nativeChatProofComparePair,
  normalizeNativeChatProofMediaPath,
  parseNativeChatProofCard
} from './native-chat-proof-card-payload'

const BUNDLE = '/Users/someone/.orca-personal/proof/grid-collage/2026-10-04-switch'

const SPEC_CARD = {
  worktree: 'grid-collage/replace-switch-tiles',
  title: 'Replace: tap another tile to switch',
  kind: 'web',
  summary: 'Tapping another tile switches Replace to it, keeping compact/expanded.',
  media: [
    {
      type: 'video',
      path: `${BUNDLE}/flow.mp4`,
      caption: 'Switching tiles',
      where: 'iPhone 15 size, Chromium'
    },
    { type: 'image', path: `${BUNDLE}/before.png`, role: 'before' },
    { type: 'image', path: `${BUNDLE}/after.png`, role: 'after' }
  ],
  checks: [
    { label: 'Tests', result: '73/73 pass' },
    { label: 'On iPhone', result: 'not checked' }
  ],
  links: [
    { label: 'PR #72', url: 'https://github.com/example/grid-collage/pull/72' },
    { label: 'Live', url: 'https://example.github.io/grid-collage/' }
  ],
  actions: [
    { label: 'Looks right', reply: 'Looks right, ship it', style: 'primary' },
    { label: 'Needs changes…', input: true }
  ]
}

describe('parseNativeChatProofCard', () => {
  it('reads the spec example', () => {
    const card = parseNativeChatProofCard(JSON.stringify(SPEC_CARD))
    expect(card).toMatchObject({
      worktree: 'grid-collage/replace-switch-tiles',
      title: 'Replace: tap another tile to switch',
      kind: 'web',
      media: [
        {
          type: 'video',
          path: 'grid-collage/2026-10-04-switch/flow.mp4',
          caption: 'Switching tiles',
          where: 'iPhone 15 size, Chromium'
        },
        {
          type: 'image',
          path: 'grid-collage/2026-10-04-switch/before.png',
          role: 'before'
        },
        {
          type: 'image',
          path: 'grid-collage/2026-10-04-switch/after.png',
          role: 'after'
        }
      ],
      checks: [
        { label: 'Tests', result: '73/73 pass', tone: 'pass' },
        { label: 'On iPhone', result: 'not checked', tone: 'unchecked' }
      ],
      links: [
        {
          label: 'PR #72',
          url: 'https://github.com/example/grid-collage/pull/72'
        },
        { label: 'Live', url: 'https://example.github.io/grid-collage/' }
      ],
      actions: [
        {
          kind: 'reply',
          label: 'Looks right',
          reply: 'Looks right, ship it',
          style: 'primary'
        },
        { kind: 'input', label: 'Needs changes…' }
      ]
    })
  })

  it('needs only a worktree and a title, and ignores keys it does not know', () => {
    expect(
      parseNativeChatProofCard('{"worktree":"orca","title":"Done","createdAt":"x","pinned":true}')
    ).toEqual({
      worktree: 'orca',
      title: 'Done',
      media: [],
      checks: [],
      links: [],
      actions: []
    })
  })

  it('keeps a media item outside the proof folder, with no path, so it can say so', () => {
    const card = parseNativeChatProofCard(
      JSON.stringify({
        worktree: 'orca',
        title: 'Done',
        media: [{ type: 'image', path: '/etc/passwd.png' }]
      })
    )
    expect(card?.media).toEqual([{ type: 'image', path: null, source: '/etc/passwd.png' }])
  })

  it.each([
    ['bad JSON', '{"worktree": "orca",'],
    ['an array', '[]'],
    ['no title', '{"worktree":"orca"}'],
    ['no worktree', '{"title":"Done"}'],
    ['an unknown kind', '{"worktree":"o","title":"t","kind":"tv"}'],
    [
      'an unknown media type',
      '{"worktree":"o","title":"t","media":[{"type":"gif","path":"a.gif"}]}'
    ],
    ['a media item with no path', '{"worktree":"o","title":"t","media":[{"type":"image"}]}'],
    [
      'an unknown role',
      '{"worktree":"o","title":"t","media":[{"type":"image","path":"a.png","role":"during"}]}'
    ],
    ['a check with no result', '{"worktree":"o","title":"t","checks":[{"label":"Tests"}]}'],
    [
      'a javascript: link',
      '{"worktree":"o","title":"t","links":[{"label":"x","url":"javascript:alert(1)"}]}'
    ],
    [
      'a file: link',
      '{"worktree":"o","title":"t","links":[{"label":"x","url":"file:///etc/hosts"}]}'
    ],
    [
      'an action with an unknown key',
      '{"worktree":"o","title":"t","actions":[{"label":"x","reply":"y","run":"rm"}]}'
    ],
    [
      'five actions',
      `{"worktree":"o","title":"t","actions":${JSON.stringify(Array.from({ length: 5 }, () => ({ label: 'a', reply: 'b' })))}}`
    ]
  ])('rejects %s', (_name, source) => {
    expect(parseNativeChatProofCard(source)).toBeNull()
  })
})

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
