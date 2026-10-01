import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { assembleNativeChatSession } from './native-chat-session-assembler'
import {
  pendingSendsAsMessages,
  prunePendingSends,
  type NativeChatPendingSend
} from './native-chat-pending'
import { isPendingMessageId } from './native-chat-synthetic-message-ids'

const FIXTURE = join(
  __dirname,
  '../../../../shared/__fixtures__/claude-mid-turn-queued-prompts.decoded.json'
)

// The ids of the rows the decoder makes from `queued_command` attachments.
const ABSORBED: { id: string; text: string; imagePaths?: string[] }[] = [
  { id: '00000000-0000-4000-8000-000000000005', text: 'Mid-turn prompt, current shape' },
  {
    id: '00000000-0000-4000-8000-000000000012',
    text: 'Mid-turn prompt with an image',
    imagePaths: ['/tmp/pasted.png']
  },
  { id: '00000000-0000-4000-8000-000000000017', text: 'Mid-turn prompt, older shape' }
]

function assembled(transcript: NativeChatMessage[], scrape: NativeChatMessage[] = []) {
  return assembleNativeChatSession({
    sources: { transcript, scrape },
    sessionId: 's',
    agent: 'claude'
  }).messages
}

/** The echo of a send issued while the turn ran, as drawn once `now` has landed. */
function listAfterSend(
  now: NativeChatMessage[],
  absorbed: (typeof ABSORBED)[number],
  decoded: NativeChatMessage[]
): NativeChatMessage[] {
  const sentAt = decoded.find((message) => message.id === absorbed.id)!.timestamp!
  const boundary = assembled(decoded.filter((message) => message.timestamp! < sentAt)).at(-1)!
  const pending: NativeChatPendingSend[] = [
    {
      id: `p-${absorbed.id}`,
      text: absorbed.text,
      ...(absorbed.imagePaths ? { imagePaths: absorbed.imagePaths } : {}),
      sentAt,
      afterMessageId: boundary.id,
      afterMessageTimestamp: boundary.timestamp,
      queuedWhileWorking: true
    }
  ]
  const messages = assembled(now)
  return assembled(now, pendingSendsAsMessages(prunePendingSends(pending, messages), messages))
}

describe('optimistic echo of a prompt Claude absorbed mid-turn', () => {
  const decoded: NativeChatMessage[] = JSON.parse(readFileSync(FIXTURE, 'utf8'))

  it.each(ABSORBED)('retires the echo once the reply lands: $text', (absorbed) => {
    const list = listAfterSend(decoded, absorbed, decoded)
    expect(list.some((message) => isPendingMessageId(message.id))).toBe(false)
    expect(list.filter((message) => message.id === absorbed.id)).toHaveLength(1)
  })

  it('without the absorbed rows the echo stays stuck below every later row', () => {
    const absorbedIds = new Set(ABSORBED.map((absorbed) => absorbed.id))
    const before = decoded.filter((message) => !absorbedIds.has(message.id))
    const list = listAfterSend(before, ABSORBED[0]!, decoded)
    expect(isPendingMessageId(list.at(-1)!.id)).toBe(true)
  })
})
