import { useCallback } from 'react'
import type { MobileNativeChatSendOrigin } from './mobile-native-chat-pending-echo'

/** A terminal send's origin, stamped with the working epoch it was typed in. */
export function useMobileNativeChatTerminalSendOrigin(
  captureSendOrigin: (text: string, sentAt?: number) => MobileNativeChatSendOrigin | null,
  workingEpoch: number | null | undefined
): (text: string, sentAt?: number) => MobileNativeChatSendOrigin | null {
  return useCallback(
    (text: string, sentAt?: number) => {
      const origin = captureSendOrigin(text, sentAt)
      return origin ? { ...origin, queuedDuringWorkingEpoch: workingEpoch } : null
    },
    [captureSendOrigin, workingEpoch]
  )
}
