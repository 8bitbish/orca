import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isHarnessTurnOpenerMessage } from '../../shared/native-chat-noise'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

const FIXTURES = join(__dirname, '../../shared/__fixtures__')

// The renderer's harness-turn pipeline test reads the decoded form so it stays inside the web
// project; this pins that form to what the decoder makes of the scrubbed raw records.
describe('Claude decoder on a task-notification transcript', () => {
  it('decodes the scrubbed records to the pinned messages, notifications included', () => {
    const decoded = readFileSync(join(FIXTURES, 'claude-task-notification-turns.jsonl'), 'utf8')
      .split('\n')
      .flatMap((line, index) => {
        const message = decodeClaudeTranscriptLine(line, `line:${index}`)
        return message ? [message] : []
      })

    expect(decoded).toEqual(
      JSON.parse(
        readFileSync(join(FIXTURES, 'claude-task-notification-turns.decoded.json'), 'utf8')
      )
    )
    expect(decoded.filter(isHarnessTurnOpenerMessage).map((message) => message.id)).toEqual([
      '98685c6d-f3cf-4466-8b68-0e366e285df4',
      '11ca4fad-f270-4ead-97e9-9c84b114a7d9'
    ])
  })
})
