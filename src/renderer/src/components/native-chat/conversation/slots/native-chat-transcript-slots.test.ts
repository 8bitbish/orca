import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import type { NativeChatResolvedPrompt } from '../../../../../../shared/native-chat/native-chat-resolution-receipt'
import type { NativeChatTurnDiff } from '../../../../../../shared/native-chat/tools/native-chat-turn-diffs'
import { nativeChatThoughtTiming } from '../../native-chat-thought-markers'
import {
  buildNativeChatTranscriptSlots,
  type NativeChatMessageSlot
} from './native-chat-transcript-slots'

const NO_STATUSES = { active: null, completedByTurn: {} }

function text(id: string, body: string, role: NativeChatMessage['role'] = 'assistant') {
  return {
    id,
    role,
    blocks: [{ type: 'text' as const, text: body }],
    timestamp: 1,
    source: 'transcript' as const
  }
}

function build(
  messages: NativeChatMessage[],
  overrides: Partial<Parameters<typeof buildNativeChatTranscriptSlots>[0]> = {}
): NativeChatMessageSlot[] {
  let turn: string | undefined
  const turnKeys = messages.map((message) => {
    if (message.role === 'user') {
      turn = message.id
    }
    return turn
  })
  return buildNativeChatTranscriptSlots({
    messages,
    turnKeys,
    liveTurnKey: undefined,
    receipts: new Map<string, NativeChatResolvedPrompt>(),
    turnStatuses: NO_STATUSES,
    turnDiffs: new Map<string, NativeChatTurnDiff>(),
    expandedTurnKeys: new Set<string>(),
    isWorking: false,
    lifecycleWorking: false,
    ...overrides
  }).filter((slot): slot is NativeChatMessageSlot => slot.kind === 'message')
}

function toolRun(id: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'tool-call', name: 'shell', input: { command: 'ls' }, state: 'completed' }],
    timestamp: 1,
    source: 'transcript'
  }
}

describe('transcript slots', () => {
  it('draws thoughts with no text and folds back-to-back ones into the first', () => {
    const marker = (id: string, timestamp: number): NativeChatMessage => ({
      id,
      role: 'reasoning',
      blocks: [{ type: 'text', text: '' }],
      timestamp,
      source: 'transcript'
    })
    const messages = [
      { ...text('u', 'go', 'user'), timestamp: 1_000 },
      marker('m1', 3_000),
      marker('m2', 7_500),
      toolRun('t'),
      marker('m3', 9_000)
    ]
    const turnKeys = messages.map(() => 'u')
    const timing = nativeChatThoughtTiming(messages, turnKeys, new Map([['m1', 2]]))
    // m2 folds into m1: one line spanning both; m3 follows a call, so it stands alone.
    expect([...timing.merged]).toEqual(['m2'])
    expect(timing.seconds.get('m1')).toBe(6)
    expect(timing.seconds.get('m3')).toBeNull()

    const slots = build(messages, { mergedThoughtIds: timing.merged })
    const drawn = slots.flatMap((slot) =>
      (slot.workRun ?? [slot.message]).map((member) => member.id)
    )
    expect(drawn).toEqual(['u', 'm1', 't', 'm3'])
  })
})
