import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { MobileNativeChatPendingMessage } from './mobile-native-chat-pending-echo'
import { retireLandedMobileNativeChatPending } from './mobile-native-chat-pending-retirement'

const FIXTURE = join(
  __dirname,
  '../../../src/shared/__fixtures__/claude-mid-turn-queued-prompts.decoded.json'
)
const NO_IMAGE_ECHOES: ReadonlySet<string> = new Set()

// Claude records a prompt it absorbs mid-turn only as a `queued_command` attachment.
// The host now publishes it as a user row, which is what retires the phone's echo.
describe('retireLandedMobileNativeChatPending on a prompt absorbed mid-turn', () => {
  const published: NativeChatMessage[] = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const sends = [
    { id: '00000000-0000-4000-8000-000000000005', text: 'Mid-turn prompt, current shape' },
    { id: '00000000-0000-4000-8000-000000000017', text: 'Mid-turn prompt, older shape' }
  ]

  function echoOf(send: (typeof sends)[number]): MobileNativeChatPendingMessage {
    const sentAt = published.find((message) => message.id === send.id)!.timestamp!
    const tail = published.findLast((message) => message.timestamp! < sentAt)!
    return {
      id: `p-${send.id}`,
      text: send.text,
      expectedOccurrence: 1,
      baselineTailMessageId: tail.id,
      baselineResolved: true
    }
  }

  it.each(sends)('retires the echo: $text', (send) => {
    expect(retireLandedMobileNativeChatPending(published, [echoOf(send)], NO_IMAGE_ECHOES)).toEqual(
      []
    )
  })

  it('kept the echo when the host published no row for it', () => {
    const withoutAbsorbed = published.filter(
      (message) => !sends.some((send) => send.id === message.id)
    )
    const echo = echoOf(sends[0]!)
    expect(retireLandedMobileNativeChatPending(withoutAbsorbed, [echo], NO_IMAGE_ECHOES)).toEqual([
      echo
    ])
  })
})
