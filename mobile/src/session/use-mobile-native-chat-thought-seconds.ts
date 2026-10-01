import { useMemo } from 'react'
import type { AgentJournalRenderItem } from '../../../src/shared/agent-session-journal-types'
import { nativeChatSessionThoughtSeconds } from '../../../src/shared/native-chat-thought-duration'
import type { AgentType, NativeChatMessage } from '../../../src/shared/native-chat-types'

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
