import { describe, expect, it } from 'vitest'
import { parseNativeChatProjectCardPayload } from './native-chat-project-card-payload'

describe('parseNativeChatProjectCardPayload', () => {
  it('reads the documented shape', () => {
    const payload = parseNativeChatProjectCardPayload(
      JSON.stringify({
        worktree: 'ImageReview/packaging',
        note: ' Testing a fix in fixtest.py ',
        ask: 'Commit skipped the pre-commit hook. Fix pnpm first?',
        icon: '🖼',
        actions: [
          { label: 'Approve', reply: 'Approve: fix pnpm and re-run the hook', style: 'primary' },
          { label: 'Reply…', input: true }
        ]
      })
    )
    expect(payload).toEqual({
      worktree: 'ImageReview/packaging',
      note: 'Testing a fix in fixtest.py',
      ask: 'Commit skipped the pre-commit hook. Fix pnpm first?',
      icon: '🖼',
      actions: [
        {
          id: 'action-0',
          kind: 'reply',
          label: 'Approve',
          reply: 'Approve: fix pnpm and re-run the hook',
          style: 'primary'
        },
        { id: 'action-1', kind: 'input', label: 'Reply…', style: 'secondary' }
      ]
    })
  })

  it('needs only a worktree', () => {
    expect(parseNativeChatProjectCardPayload('{"worktree":"orca"}')).toEqual({
      worktree: 'orca',
      actions: []
    })
  })

  it.each([
    ['bad JSON', '{"worktree": "orca",'],
    ['JSON with comments', '{ "worktree": "orca" // the repo\n}'],
    ['an array', '[{"worktree":"orca"}]'],
    ['no worktree', '{"note":"hi"}'],
    ['a blank worktree', '{"worktree":"  "}'],
    ['a non-string note', '{"worktree":"orca","note":3}'],
    ['an icon that is a sentence', '{"worktree":"orca","icon":"a whole sentence"}'],
    ['actions that are not a list', '{"worktree":"orca","actions":{}}'],
    ['an action with no label', '{"worktree":"orca","actions":[{"reply":"go"}]}'],
    ['a reply action with no reply', '{"worktree":"orca","actions":[{"label":"Go"}]}'],
    [
      'an input action that also has a reply',
      '{"worktree":"orca","actions":[{"label":"Go","input":true,"reply":"x"}]}'
    ],
    [
      'an unknown style',
      '{"worktree":"orca","actions":[{"label":"Go","reply":"go","style":"danger"}]}'
    ],
    [
      'more than four actions',
      JSON.stringify({
        worktree: 'orca',
        actions: Array.from({ length: 5 }, (_, index) => ({ label: `A${index}`, reply: 'x' }))
      })
    ]
  ])('rejects %s, so the raw block shows', (_name, source) => {
    expect(parseNativeChatProjectCardPayload(source)).toBeNull()
  })
})
