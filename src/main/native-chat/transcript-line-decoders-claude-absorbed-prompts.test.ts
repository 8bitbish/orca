import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'
import { decodeClaudeTurnLifecycle } from './transcript-turn-lifecycle'

const FIXTURES = join(__dirname, '../../shared/__fixtures__')

function fixtureLines(): string[] {
  return readFileSync(join(FIXTURES, 'claude-mid-turn-queued-prompts.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
}

type QueuedCommand = { commandMode?: string; origin?: { kind: string } }

function queuedCommandLines(): { line: string; attachment: QueuedCommand }[] {
  return fixtureLines().flatMap((line) => {
    const record = JSON.parse(line)
    return record.type === 'attachment' ? [{ line, attachment: record.attachment }] : []
  })
}

// The renderer and mobile tests read the decoded form; this pins it to the raw records.
describe('Claude decoder on prompts absorbed mid-turn', () => {
  it('decodes the scrubbed records to the pinned messages', () => {
    const decoded = fixtureLines().flatMap((line, index) => {
      const message = decodeClaudeTranscriptLine(line, `line:${index}`)
      return message ? [message] : []
    })
    expect(decoded).toEqual(
      JSON.parse(
        readFileSync(join(FIXTURES, 'claude-mid-turn-queued-prompts.decoded.json'), 'utf8')
      )
    )
  })

  it('turns each human queued_command, current and older shape, into one user row', () => {
    const rows = queuedCommandLines().flatMap(({ line }) => {
      const message = decodeClaudeTranscriptLine(line, 'fallback')
      return message ? [message] : []
    })
    expect(rows.map((row) => [row.role, row.blocks])).toEqual([
      ['user', [{ type: 'text', text: 'Mid-turn prompt, current shape' }]],
      ['user', [{ type: 'text', text: '[Image #1] Mid-turn prompt with an image' }]],
      ['user', [{ type: 'text', text: 'Mid-turn prompt, older shape' }]]
    ])
    const first = JSON.parse(queuedCommandLines()[0]!.line)
    expect(rows[0]).toMatchObject({ id: first.uuid, timestamp: Date.parse(first.timestamp) })
  })

  it('never makes a user row of a task notification, coordinator or peer delivery', () => {
    const others = queuedCommandLines().filter(
      ({ attachment }) => attachment.commandMode !== 'prompt' || attachment.origin?.kind === 'peer'
    )
    expect(others.map(({ attachment }) => attachment.origin?.kind).sort()).toEqual([
      'coordinator',
      'peer',
      'task-notification'
    ])
    for (const { line } of others) {
      expect(decodeClaudeTranscriptLine(line, 'fallback')).toBeNull()
    }
  })

  it('does not reopen the running turn in the lifecycle', () => {
    for (const { line } of queuedCommandLines()) {
      expect(decodeClaudeTurnLifecycle(line, 'fallback')).toBeNull()
    }
  })
})
