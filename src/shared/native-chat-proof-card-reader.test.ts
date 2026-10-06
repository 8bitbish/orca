import { describe, expect, it } from 'vitest'
import { NATIVE_CHAT_PROOF_CARD_LIMITS as LIMITS } from './native-chat-proof-card-payload'
import { parseNativeChatProofCard } from './native-chat-proof-card-reader'
import { truncateNativeChatProofText } from './native-chat-proof-card-text'

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

const NO_ADJUSTMENTS = {
  truncatedFields: [],
  droppedCounts: { media: 0, checks: 0, links: 0, actions: 0 },
  dropped: [],
  ignoredFields: []
}

function parse(overrides: Record<string, unknown>) {
  return parseNativeChatProofCard(JSON.stringify({ worktree: 'o', title: 't', ...overrides }))
}

/** Made-up words of an exact length. */
function words(length: number, seed = 'lorem ipsum dolor sit amet '): string {
  return `${seed.repeat(Math.ceil(length / seed.length)).slice(0, length - 1)}.`
}

function expectCut(shown: string | undefined, full: string, max: number): void {
  expect(shown).toBe(truncateNativeChatProofText(full, max))
  expect(shown?.length).toBeLessThanOrEqual(max)
  expect(shown?.endsWith('…')).toBe(true)
  expect(full.startsWith(shown?.slice(0, -1) ?? '-')).toBe(true)
}

describe('parseNativeChatProofCard', () => {
  it('reads the spec example with nothing adjusted', () => {
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
          id: 'action-0',
          kind: 'reply',
          label: 'Looks right',
          reply: 'Looks right, ship it',
          style: 'primary'
        },
        { id: 'action-1', kind: 'input', label: 'Needs changes…' }
      ],
      adjustments: NO_ADJUSTMENTS
    })
    expect(card?.full).toBeUndefined()
    expect(card?.checks[0].full).toBeUndefined()
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
      actions: [],
      adjustments: NO_ADJUSTMENTS
    })
  })

  it.each([
    ['title', LIMITS.title],
    ['summary', LIMITS.summary]
  ] as const)('cuts an overlong %s and keeps the full text', (field, max) => {
    const long = words(max + 40)
    const card = parse({ [field]: long })
    expectCut(card?.[field], long, max)
    expect(card?.full?.[field]).toBe(long)
    expect(card?.adjustments.truncatedFields).toEqual([field])
  })

  it.each([
    ['label', LIMITS.label],
    ['result', LIMITS.result]
  ] as const)('cuts an overlong check %s and keeps the full text', (field, max) => {
    const long = words(max + 8)
    const card = parse({
      checks: [{ label: 'Tokens', result: 'ok', [field]: long }]
    })
    expectCut(card?.checks[0][field], long, max)
    expect(card?.checks[0].full?.[field]).toBe(long)
    expect(card?.adjustments.truncatedFields).toEqual([`checks[0].${field}`])
  })

  it('reads the tone from the full result, not the cut one', () => {
    const card = parse({
      checks: [{ label: 'Tests', result: `${words(200)} 1 failed` }]
    })
    expect(card?.checks[0].tone).toBe('fail')
  })

  it.each([
    ['caption', LIMITS.caption],
    ['where', LIMITS.where]
  ] as const)('cuts an overlong media %s', (field, max) => {
    const long = words(max + 1)
    const card = parse({
      media: [{ type: 'image', path: 'p/a.png', [field]: long }]
    })
    expectCut(card?.media[0][field], long, max)
    expect(card?.media[0].full?.[field]).toBe(long)
    expect(card?.adjustments.truncatedFields).toEqual([`media[0].${field}`])
  })

  it('cuts an overlong link label but never the URL', () => {
    const long = words(LIMITS.label + 10)
    const card = parse({
      links: [{ label: long, url: 'https://example.com/a' }]
    })
    expect(card?.links[0]).toEqual({
      label: truncateNativeChatProofText(long, LIMITS.label),
      url: 'https://example.com/a',
      full: { label: long }
    })
  })

  it('cuts an overlong action label but keeps its reply whole', () => {
    const long = words(60)
    const card = parse({ actions: [{ label: long, reply: 'Ship it' }] })
    expect(card?.actions[0]).toMatchObject({ kind: 'reply', reply: 'Ship it' })
    expectCut(card?.actions[0].label, long, LIMITS.actionLabel)
    expect(card?.adjustments.truncatedFields).toEqual(['actions[0].label'])
  })

  it('cuts between code points, so an emoji is never split', () => {
    // An emoji (a surrogate pair) straddles the cut.
    const result = `${'a'.repeat(158)}😀😀 and more`
    const card = parse({ checks: [{ label: 'Emoji', result }] })
    const cut = card?.checks[0].result ?? ''
    expect(cut).toBe(`${'a'.repeat(158)}…`)
    expect(cut.length).toBeLessThanOrEqual(LIMITS.result)
    expect(truncateNativeChatProofText(`ab😀cd`, 4)).toBe('ab…')
    expect(truncateNativeChatProofText(`ab😀cd`, 5)).toBe('ab😀…')
    // A joined emoji sequence does not end on its joiner.
    expect(truncateNativeChatProofText('a👩\u200d💻xyz', 5)).toBe('a👩…')
  })

  it('keeps the first items of a section past its maximum and counts the rest', () => {
    const card = parse({
      media: Array.from({ length: LIMITS.media + 2 }, (_, i) => ({
        type: 'image',
        path: `p/${i}.png`
      })),
      checks: Array.from({ length: LIMITS.checks + 3 }, (_, i) => ({
        label: `C${i}`,
        result: 'ok'
      })),
      links: Array.from({ length: LIMITS.links + 1 }, (_, i) => ({
        label: `L${i}`,
        url: `https://example.com/${i}`
      })),
      actions: Array.from({ length: LIMITS.actions + 1 }, (_, i) => ({
        label: `A${i}`,
        reply: `r${i}`
      }))
    })
    expect(card?.media).toHaveLength(LIMITS.media)
    expect(card?.media.at(-1)?.path).toBe(`p/${LIMITS.media - 1}.png`)
    expect(card?.checks.map((check) => check.label).at(-1)).toBe(`C${LIMITS.checks - 1}`)
    expect(card?.links).toHaveLength(LIMITS.links)
    expect(card?.actions).toHaveLength(LIMITS.actions)
    expect(card?.adjustments.droppedCounts).toEqual({
      media: 2,
      checks: 3,
      links: 1,
      actions: 1
    })
    expect(card?.adjustments.dropped).toContainEqual({
      field: 'checks[14]',
      reason: 'over-max'
    })
  })

  it.each([
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a file: URL', 'file:///etc/hosts'],
    ['an unparseable URL', 'not a url'],
    ['an overlong URL', `https://example.com/${'a'.repeat(LIMITS.url)}`]
  ])('drops just the link with %s', (_name, url) => {
    const card = parse({
      links: [
        { label: 'bad', url },
        { label: 'good', url: 'https://example.com/ok' }
      ]
    })
    expect(card?.links).toEqual([{ label: 'good', url: 'https://example.com/ok' }])
    expect(card?.adjustments.droppedCounts.links).toBe(1)
    expect(card?.adjustments.dropped).toEqual([{ field: 'links[0]', reason: 'invalid-url' }])
  })

  it('drops an action whose reply is too long, never cutting what it would send', () => {
    const card = parse({
      actions: [
        { label: 'Long', reply: 'x'.repeat(LIMITS.actionReply + 1) },
        { label: 'Short', reply: 'ok' }
      ]
    })
    expect(card?.actions).toEqual([
      {
        id: 'action-0',
        kind: 'reply',
        label: 'Short',
        reply: 'ok',
        style: 'secondary'
      }
    ])
    expect(card?.adjustments.dropped).toEqual([{ field: 'actions[0]', reason: 'reply-too-long' }])
  })

  it.each([
    [
      'a check with no label',
      { checks: [{ result: 'ok' }, { label: 'b', result: 'ok' }] },
      'checks'
    ],
    [
      'a check with no result',
      { checks: [{ label: 'a' }, { label: 'b', result: 'ok' }] },
      'checks'
    ],
    [
      'a link with no label',
      {
        links: [{ url: 'https://a.com' }, { label: 'b', url: 'https://b.com' }]
      },
      'links'
    ],
    [
      'a media item with no path',
      { media: [{ type: 'image' }, { type: 'image', path: 'p/b.png' }] },
      'media'
    ],
    [
      'an unknown media type',
      {
        media: [
          { type: 'gif', path: 'p/a.gif' },
          { type: 'image', path: 'p/b.png' }
        ]
      },
      'media'
    ],
    ['a non-object check', { checks: ['ok', { label: 'b', result: 'ok' }] }, 'checks'],
    [
      'an action with an unknown key',
      {
        actions: [
          { label: 'x', reply: 'y', run: 'rm' },
          { label: 'b', reply: 'c' }
        ]
      },
      'actions'
    ],
    [
      'an action with no label',
      { actions: [{ reply: 'y' }, { label: 'b', reply: 'c' }] },
      'actions'
    ]
  ] as const)('drops only %s', (_name, overrides, section) => {
    const card = parse(overrides)
    expect(card).not.toBeNull()
    expect(card?.[section]).toHaveLength(1)
    expect(card?.adjustments.droppedCounts[section]).toBe(1)
  })

  it('leaves off an unknown kind or role and notes it', () => {
    const card = parse({
      kind: 'tv',
      media: [{ type: 'image', path: 'p/a.png', role: 'during' }]
    })
    expect(card?.kind).toBeUndefined()
    expect(card?.media[0].role).toBeUndefined()
    expect(card?.adjustments.ignoredFields).toEqual(['kind', 'media[0].role'])
  })

  it.each([
    ['bad JSON', '{"worktree": "orca",'],
    ['an array', '[]'],
    ['a string', '"card"'],
    ['no title', '{"worktree":"orca"}'],
    ['a blank title', '{"worktree":"orca","title":"  "}'],
    ['no worktree', '{"title":"Done"}'],
    ['an overlong worktree', JSON.stringify({ worktree: 'w'.repeat(513), title: 't' })],
    ['media that is not a list', '{"worktree":"o","title":"t","media":{"type":"image"}}'],
    ['checks that are not a list', '{"worktree":"o","title":"t","checks":"all pass"}'],
    [
      'a media path outside the proof folder',
      JSON.stringify({
        worktree: 'o',
        title: 't',
        media: [{ type: 'image', path: '/Users/someone/Desktop/a.png' }]
      })
    ],
    [
      'a media path that climbs out',
      JSON.stringify({
        worktree: 'o',
        title: 't',
        media: [{ type: 'image', path: `${BUNDLE}/../../../../.ssh/id.png` }]
      })
    ],
    [
      'an overlong media path',
      JSON.stringify({
        worktree: 'o',
        title: 't',
        media: [{ type: 'image', path: `p/${'a/'.repeat(600)}x.png` }]
      })
    ],
    [
      'a media path with the wrong extension',
      JSON.stringify({
        worktree: 'o',
        title: 't',
        media: [{ type: 'image', path: 'p/flow.mp4' }]
      })
    ],
    [
      'an unsafe path past the media maximum',
      JSON.stringify({
        worktree: 'o',
        title: 't',
        media: [
          ...Array.from({ length: LIMITS.media }, (_, i) => ({
            type: 'image',
            path: `p/${i}.png`
          })),
          { type: 'image', path: '/etc/passwd.png' }
        ]
      })
    ]
  ])('still rejects %s', (_name, source) => {
    expect(parseNativeChatProofCard(source)).toBeNull()
  })
})

/** The shape of three real bundles that used to fall back to raw code, with made-up text. */
describe('bundles that used to be rejected', () => {
  const root = '/Users/someone/.orca-personal/proof/demo'
  function bundle(name: string, resultLengths: number[], actionCount: number, ext = 'png') {
    return {
      worktree: 'demo/personal',
      title: words(72),
      kind: 'figma',
      summary: words(363),
      media: Array.from({ length: 5 }, (_, i) => ({
        type: 'image',
        path: `${root}/${name}/shot-${i}.${ext}`,
        caption: words(60)
      })),
      checks: resultLengths.map((length, i) => ({
        label: `Check ${i}`,
        result: words(length)
      })),
      links: [
        {
          label: 'Figma board',
          url: 'https://www.figma.com/design/abc/demo?node-id=1-2'
        },
        { label: 'Ticket', url: 'https://example.atlassian.net/browse/DEMO-1' }
      ],
      actions: [
        ...Array.from({ length: actionCount - 1 }, (_, i) => ({
          label: `Option ${i}`,
          reply: words(35),
          ...(i === 0 ? { style: 'primary' } : {})
        })),
        { label: 'Something else…', input: true }
      ]
    }
  }

  it.each([
    [
      'design-review-cards-dark',
      bundle('2026-10-06-cards', [168, 130, 137, 116, 73, 12, 34], 2, 'jpg'),
      0
    ],
    ['jira-comment round 3', bundle('2026-10-05-round-3', [111, 162, 119, 92, 55, 4, 37], 2), 1],
    ['jira-comment round 4', bundle('2026-10-05-round-4', [96, 203, 39, 55, 30, 37], 4), 1]
  ])('%s now parses with its long check result cut', (_name, card, index) => {
    const parsed = parseNativeChatProofCard(JSON.stringify(card))
    expect(parsed).not.toBeNull()
    expect(parsed?.checks).toHaveLength(card.checks.length)
    expectCut(parsed?.checks[index].result, card.checks[index].result, LIMITS.result)
    expect(parsed?.checks[index].full?.result).toBe(card.checks[index].result)
    expect(parsed?.adjustments.truncatedFields).toEqual([`checks[${index}].result`])
    expect(parsed?.actions).toHaveLength(card.actions.length)
  })
})
