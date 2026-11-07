import { useMemo } from 'react'
import type { AgentJournalRenderItem } from '../../../src/shared/agent-session/journal/agent-session-journal-types'
import { nativeChatSessionThoughtSeconds } from '../../../src/shared/native-chat-thought-duration'
import type { AgentType } from '../../../src/shared/agent-status/contracts/agent-status-types'
import type { NativeChatMessage } from '../../../src/shared/native-chat/native-chat-types'
import { mobileNativeChatThoughtRows } from './mobile-native-chat-thought-rows'
import type { MobileNativeChatController } from './native-chat/mobile-native-chat-controller-contract'

const NO_THOUGHT_SECONDS: ReadonlyMap<string, number> = new Map()

/** Whole seconds per reasoning row: the structured journal's stamps, else the transcript's. */
export function useMobileNativeChatThoughtSeconds(
  agent: AgentType | null,
  journalItems: readonly AgentJournalRenderItem[] | undefined,
  messages: readonly NativeChatMessage[]
): ReadonlyMap<string, number> {
  return useMemo(
    () =>
      agent ? nativeChatSessionThoughtSeconds(agent, journalItems, messages) : NO_THOUGHT_SECONDS,
    [agent, journalItems, messages]
  )
}

/** The folded rows with durations the host's journal did not stamp, read from the transcript. */
export function useMobileNativeChatTimedThoughtRows(
  controller: Pick<
    MobileNativeChatController,
    | 'nativeChatAgent'
    | 'nativeChatTurnJournal'
    | 'nativeChatSession'
    | 'nativeChatTurnActive'
    | 'nativeChatAwaitingInput'
  >,
  folded: NativeChatMessage[],
  streaming: string | null
): NativeChatMessage[] {
  const thoughtSeconds = useMobileNativeChatThoughtSeconds(
    controller.nativeChatAgent,
    controller.nativeChatTurnJournal?.items,
    controller.nativeChatSession.messages
  )
  // Live only while nothing streams after it, as the turn's newest output.
  const thoughtWorking =
    controller.nativeChatTurnActive &&
    controller.nativeChatAwaitingInput == null &&
    streaming === null
  return useMemo(
    () => mobileNativeChatThoughtRows(folded, thoughtSeconds, thoughtWorking),
    [folded, thoughtSeconds, thoughtWorking]
  )
}
