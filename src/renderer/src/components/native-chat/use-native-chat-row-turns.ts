import { useMemo } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { selectNativeChatActiveTurnKey } from '../../../../shared/native-chat-turn-status'
import {
  nativeChatHarnessTurns,
  nativeChatRowTurnKeys
} from '../../../../shared/native-chat-turn-grouping'
import { compareMessages } from './native-chat-session-assembler'

/** Each drawn row's turn, resolved once (a per-row findLast is quadratic on a long
 *  transcript), and the turn whose bar carries the live clock. */
export function useNativeChatRowTurns({
  sessionMessages,
  messages,
  turnKeysByItemId,
  activeTurnOpenedBy
}: {
  /** The unprojected rows, harness deliveries included. */
  sessionMessages: readonly NativeChatMessage[]
  messages: readonly NativeChatMessage[]
  turnKeysByItemId: ReadonlyMap<string, string> | null
  activeTurnOpenedBy: string | null | undefined
}): { turnKeys: (string | undefined)[]; activeTurnKey: string } {
  // Without the host's attribution, a turn a harness delivery opened (a background-task
  // notification) is keyed by that delivery, which the projection has already stripped.
  const harnessTurns = useMemo(
    () => (turnKeysByItemId ? null : nativeChatHarnessTurns(sessionMessages, compareMessages)),
    [sessionMessages, turnKeysByItemId]
  )
  const turnKeys = useMemo(
    () => nativeChatRowTurnKeys(messages, turnKeysByItemId ?? harnessTurns?.turnKeysByItemId),
    [harnessTurns, messages, turnKeysByItemId]
  )
  const activeTurnKey = selectNativeChatActiveTurnKey(
    messages,
    activeTurnOpenedBy ?? harnessTurns?.latestTurnOpenedBy
  )
  return { turnKeys, activeTurnKey }
}
