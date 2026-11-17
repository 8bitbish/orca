import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import {
  nativeChatHarnessTurns,
  nativeChatRowTurnKeys
} from '../../../../shared/native-chat/transcript/turns/native-chat-turn-grouping'
import { withoutPullRequestEventRows } from '../../../../shared/native-chat/native-chat-pull-request-event'
import { nativeChatShowsCiResultLines } from '../../../../shared/native-chat/native-chat-appearance-settings'
import { nativeChatSessionThoughtSeconds } from '../../../../shared/native-chat-thought-duration'
import { compareNativeChatDisplayMessages as compareMessages } from '../../../../shared/native-chat/transcript/messages/native-chat-message-order'
import {
  nativeChatThoughtTiming,
  type NativeChatThoughtTiming
} from './native-chat-thought-markers'
import type { NativeChatTurnRows } from './conversation/slots/use-native-chat-turn-membership'

/** The conversation's turns plus terminal transcripts' harness turns (a turn a harness delivery
 *  opened, such as a background-task notification, is keyed by that delivery, which the
 *  projection has already stripped) and each reasoning row's fallback timing. A subagent's view
 *  (`conversation` false) keeps its turnless rows. */
export function useNativeChatRowTurns(
  /** `messages` are the unprojected rows, harness deliveries included. */
  session: { agent: AgentType; messages: readonly NativeChatMessage[] },
  membership: NativeChatTurnRows,
  journalItems: readonly AgentJournalRenderItem[] | undefined,
  conversation: boolean
): NativeChatTurnRows & { thoughtTiming: NativeChatThoughtTiming } {
  const harnessTurns = useMemo(
    () =>
      journalItems || !conversation
        ? null
        : nativeChatHarnessTurns(session.messages, compareMessages),
    [conversation, journalItems, session.messages]
  )
  const thoughtSeconds = useMemo(
    () => nativeChatSessionThoughtSeconds(session.agent, journalItems, membership.messages),
    [journalItems, membership.messages, session.agent]
  )
  const rows = useMemo(
    () =>
      harnessTurns
        ? {
            ...membership,
            turnKeys: nativeChatRowTurnKeys(membership.messages, harnessTurns.turnKeysByItemId),
            liveTurnKey: harnessTurns.latestTurnOpenedBy ?? membership.liveTurnKey
          }
        : membership,
    [harnessTurns, membership]
  )
  return useMemo(
    () => ({
      ...rows,
      thoughtTiming: nativeChatThoughtTiming(rows.messages, rows.turnKeys, thoughtSeconds)
    }),
    [rows, thoughtSeconds]
  )
}

/** The rows the transcript draws: CI result lines leave it entirely when hidden, so they
 *  reserve no row or gap. */
export function useNativeChatDrawnTurnRows(
  turnRows: NativeChatTurnRows
): Pick<NativeChatTurnRows, 'messages' | 'turnKeys'> {
  const showCiResultLines = useAppStore((state) => nativeChatShowsCiResultLines(state.settings))
  return useMemo(
    () => (showCiResultLines ? turnRows : withoutPullRequestEventRows(turnRows)),
    [showCiResultLines, turnRows]
  )
}
