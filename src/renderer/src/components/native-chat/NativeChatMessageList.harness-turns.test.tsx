// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  nativeChatHarnessTurns,
  nativeChatRowTurnKeys
} from '../../../../shared/native-chat-turn-grouping'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { NativeChatMessageList } from './NativeChatMessageList'
import { installNativeChatMessageListTestViewport } from './native-chat-message-list-test-viewport'
import { createNativeChatMessageListProjection } from './native-chat-message-list-projection'
import { assembleNativeChatSession, compareMessages } from './native-chat-session-assembler'
import {
  nativeChatLatestTurnId,
  nativeChatTranscriptSettledTurns
} from './native-chat-terminal-turn'
import {
  buildNativeChatTranscriptSlots,
  type NativeChatMessageSlot
} from './native-chat-transcript-slots'
import type { NativeChatLiveSession } from './use-native-chat-live-session'

// Scrubbed records from a Claude Code 2.1.286 session: two prompts, each answered and then
// followed by a background-task notification the agent answered on its own. Text is
// replaced; ids, timestamps, record shapes and order are the real ones. The decoded form is
// pinned against the raw records by transcript-line-decoders-claude.harness-turns.test.ts.
const FIXTURE = join(
  __dirname,
  '../../../../shared/__fixtures__/claude-task-notification-turns.decoded.json'
)

const PROMPT_1 = 'dd613f68-794f-4dea-ac4c-8503ba72fce8'
const NOTIFICATION_1 = '98685c6d-f3cf-4466-8b68-0e366e285df4'
const PROMPT_2 = 'e72105c4-4705-4521-93d0-7af49f1fcdb8'
const NOTIFICATION_2 = '11ca4fad-f270-4ead-97e9-9c84b114a7d9'
const PROMPT_3 = '7e849485-1317-4969-9649-9d526a3e8af8'

function fixtureMessages(): NativeChatMessage[] {
  const messages: NativeChatMessage[] = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  return messages
}

function fixtureSession(): NativeChatLiveSession {
  const assembled = assembleNativeChatSession({
    sources: { transcript: fixtureMessages() },
    sessionId: 'session-1',
    agent: 'claude'
  })
  return {
    ...assembled,
    hasMore: false,
    loadingEarlier: false,
    olderHistoryGeneration: 0,
    loadEarlier: vi.fn(),
    readPhase: 'ready'
  }
}

let restoreViewport = (): void => {}
beforeAll(() => {
  restoreViewport = installNativeChatMessageListTestViewport()
})
afterAll(() => restoreViewport())
afterEach(cleanup)

describe('terminal-backed transcript with background-task notifications', () => {
  it('gives every reply its own turn, duration and drawn answer', () => {
    const session = fixtureSession()
    const ids = {
      prompt1: PROMPT_1,
      notification1: NOTIFICATION_1,
      prompt2: PROMPT_2,
      notification2: NOTIFICATION_2,
      prompt3: PROMPT_3
    }
    const messages = createNativeChatMessageListProjection()(session.messages).conversation
    const harness = nativeChatHarnessTurns(session.messages, compareMessages)
    const turnKeys = nativeChatRowTurnKeys(messages, harness?.turnKeysByItemId)
    const turnOf = (text: string): string | undefined =>
      turnKeys[
        messages.findIndex((message) =>
          message.blocks.some((block) => block.type === 'text' && block.text === text)
        )
      ]

    expect(turnOf('Assistant reply 1.')).toBe(ids.prompt1)
    expect(turnOf('Assistant reply 2.')).toBe(ids.notification1)
    expect(turnOf('Assistant reply 3.')).toBe(ids.prompt2)
    expect(turnOf('Assistant reply 4.')).toBe(ids.notification2)

    const settled = nativeChatTranscriptSettledTurns(session.messages)
    expect(
      Object.fromEntries([...settled].map(([key, turn]) => [key, turn?.workedSeconds]))
    ).toEqual({
      [ids.prompt1]: 19,
      [ids.notification1]: 8,
      [ids.prompt2]: 12,
      [ids.notification2]: 3
    })
    expect(nativeChatLatestTurnId(session.messages)).toBe(ids.prompt3)

    const slots = buildNativeChatTranscriptSlots({
      messages,
      turnKeys,
      liveTurnKey: ids.prompt3,
      receipts: new Map(),
      turnStatuses: {
        active: null,
        completedByTurn: Object.fromEntries(
          [...settled].flatMap(([key, turn]) =>
            turn
              ? [
                  [
                    key,
                    {
                      startedAt: turn.startedAt,
                      thinking: false,
                      workedSeconds: turn.workedSeconds
                    }
                  ]
                ]
              : []
          )
        )
      },
      turnDiffs: new Map(),
      expandedTurnKeys: new Set(),
      isWorking: false,
      lifecycleWorking: false
    }).filter((slot): slot is NativeChatMessageSlot => slot.kind === 'message')
    const drawnText = slots
      .filter((slot) => !slot.folded)
      .flatMap((slot) => slot.message.blocks)
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    expect(drawnText).toEqual(
      expect.arrayContaining([
        'Assistant reply 1.',
        'Assistant reply 2.',
        'Assistant reply 3.',
        'Assistant reply 4.'
      ])
    )
    // A notification turn has no bubble, so its bar sits above its own first row.
    const bars = slots.filter((slot) => slot.status !== undefined)
    expect(
      bars.map((slot) => [slot.turnKey, slot.status?.workedSeconds, slot.statusAbove])
    ).toEqual([
      [ids.prompt1, 19, false],
      [ids.notification1, 8, true],
      [ids.prompt2, 12, false],
      [ids.notification2, 3, true]
    ])
  })

  it('draws both replies in the list instead of folding the first behind the notification', () => {
    const session = fixtureSession()
    render(
      <NativeChatMessageList
        session={session}
        isWorking={false}
        expandSignal={false}
        fontScale={1}
        settledTurns={nativeChatTranscriptSettledTurns(session.messages)}
      />
    )

    for (const reply of [1, 2, 3, 4]) {
      expect(screen.getByText(`Assistant reply ${reply}.`)).toBeInTheDocument()
    }
    expect(screen.getByText('Human prompt 1')).toBeInTheDocument()
    expect(screen.queryByText(/task-notification/)).toBeNull()
    expect(screen.getByText('Worked for 19s')).toBeInTheDocument()
    expect(screen.getByText('Worked for 8s')).toBeInTheDocument()
    expect(screen.getByText('Worked for 12s')).toBeInTheDocument()
    expect(screen.getByText('Worked for 3s')).toBeInTheDocument()
  })

  it('puts the live clock on a running notification turn, not the prompt before it', () => {
    const session = fixtureSession()
    const upToNotification = session.messages.filter(
      (message) =>
        message.timestamp !== null && message.timestamp <= Date.parse('2026-10-01T07:02:50.252Z')
    )
    const startedAt = Date.now() - 5_000
    render(
      <NativeChatMessageList
        session={{ ...session, messages: upToNotification }}
        isWorking
        workingStartedAt={startedAt}
        expandSignal={false}
        fontScale={1}
        settledTurns={nativeChatTranscriptSettledTurns(upToNotification)}
      />
    )

    // The prompt before it keeps its settled duration; the running turn counts on its own bar.
    expect(screen.getByText('Worked for 12s')).toBeInTheDocument()
    expect(screen.getByText(/^Working for \d+s$/)).toBeInTheDocument()
    expect(screen.getByText('Assistant reply 3.')).toBeInTheDocument()
  })
})
