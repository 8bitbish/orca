import type { NativeChatLiveTurnIndicator } from '../../../src/shared/native-chat-turn-status'
import type { MobileNativeChatInputLockReason } from './MobileNativeChatView'
import type { MobileNativeChatQueueSurface } from './MobileNativeChatTerminalQueuedMessages'
import { mobileNativeChatComposerPlaceholder as hostComposerPlaceholder } from './native-chat/use-mobile-native-chat-input-lease'

/** The composer's hint: why input is locked, what a send does while stopping, or that a send now
 *  waits in the host's terminal queue. */
export function mobileNativeChatComposerPlaceholder(
  lockReason: MobileNativeChatInputLockReason | null,
  turnIndicator: Pick<NativeChatLiveTurnIndicator, 'afterStop'> | null | undefined,
  queue: Pick<MobileNativeChatQueueSurface, 'willQueue'> | undefined
): string {
  const afterStop = turnIndicator?.afterStop
  if (
    queue?.willQueue === true &&
    !afterStop &&
    lockReason !== 'disconnected' &&
    lockReason !== 'waiting'
  ) {
    return 'Queue a message for when it finishes'
  }
  return hostComposerPlaceholder(lockReason, afterStop)
}
