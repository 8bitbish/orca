import { useMemo } from 'react'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session-journal-types'
import type { AgentType, NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  nativeChatHarnessTurns,
  nativeChatRowTurnKeys
} from '../../../../shared/native-chat-turn-grouping'
import { nativeChatSessionThoughtSeconds } from '../../../../shared/native-chat-thought-duration'
import { compareMessages } from './native-chat-session-assembler'
import {
  useNativeChatTurnMembership,
  type NativeChatTurnRows
} from './use-native-chat-turn-membership'

/** `useNativeChatTurnMembership`, plus terminal transcripts' harness turns (a turn a harness
 *  delivery opened, such as a background-task notification, is keyed by that delivery, which the
 *  projection has already stripped) and each reasoning row's duration. */
export function useNativeChatRowTurns(
  /** `messages` are the unprojected rows, harness deliveries included. */
  session: { agent: AgentType; messages: readonly NativeChatMessage[] },
  messages: readonly NativeChatMessage[],
  journalItems: readonly AgentJournalRenderItem[] | undefined,
  journalSubmissions: readonly AgentJournalSubmission[] | undefined
): NativeChatTurnRows & { thoughtSeconds: ReadonlyMap<string, number> } {
  const membership = useNativeChatTurnMembership(messages, journalItems, journalSubmissions)
  const harnessTurns = useMemo(
    () => (journalItems ? null : nativeChatHarnessTurns(session.messages, compareMessages)),
    [journalItems, session.messages]
  )
  const thoughtSeconds = useMemo(
    () => nativeChatSessionThoughtSeconds(session.agent, journalItems, messages),
    [journalItems, messages, session.agent]
  )
  return useMemo(
    () =>
      harnessTurns
        ? {
            messages: membership.messages,
            turnKeys: nativeChatRowTurnKeys(membership.messages, harnessTurns.turnKeysByItemId),
            liveTurnKey: harnessTurns.latestTurnOpenedBy ?? membership.liveTurnKey,
            thoughtSeconds
          }
        : { ...membership, thoughtSeconds },
    [harnessTurns, membership, thoughtSeconds]
  )
}
