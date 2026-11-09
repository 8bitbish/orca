import { useMemo } from 'react'
import {
  nativeChatPendingSendPlacement,
  type NativeChatPendingSend
} from '../../../../src/shared/native-chat/transcript/native-chat-pending-sends'

/** Marks each pending echo active or queued against the turn that was working when it was sent. */
export function useMobileNativeChatPlacedPending<
  T extends Pick<NativeChatPendingSend, 'queuedDuringWorkingEpoch'>
>(
  pending: readonly T[],
  workingEpoch: number | null | undefined
): (T & {
  pendingSend: 'active' | 'queued'
})[] {
  return useMemo(
    () =>
      pending.map((entry) => ({
        ...entry,
        pendingSend: nativeChatPendingSendPlacement(entry, workingEpoch)
      })),
    [pending, workingEpoch]
  )
}
