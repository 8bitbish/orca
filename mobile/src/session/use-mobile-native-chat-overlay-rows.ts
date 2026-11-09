import type { NativeChatMessage } from '../../../src/shared/native-chat/native-chat-types'
import type { MobileNativeChatController } from './native-chat/mobile-native-chat-controller-contract'
import type { MobileNativeChatImageAttachments } from './native-chat/composer/use-mobile-native-chat-image-attachments'
import type { MobileNativeChatQueueSurface } from './MobileNativeChatTerminalQueuedMessages'
import { useMobileNativeChatTimedThoughtRows } from './use-mobile-native-chat-thought-seconds'
import { useMobileNativeChatImageRestoringQueue } from './use-mobile-native-chat-image-restoring-queue'

/** What the chat overlay adds to the view: thought timing and the host queue. */
export function useMobileNativeChatOverlayRows(
  controller: Parameters<typeof useMobileNativeChatTimedThoughtRows>[0] &
    Pick<MobileNativeChatController, 'nativeChatQueue' | 'nativeChatWillQueue'>,
  folded: NativeChatMessage[],
  streaming: string | null,
  images: MobileNativeChatImageAttachments
): { folded: NativeChatMessage[]; queue: MobileNativeChatQueueSurface } {
  // Durations the host's journal did not stamp, read from the transcript (terminal chats).
  const timedFolded = useMobileNativeChatTimedThoughtRows(controller, folded, streaming)
  // The overlay owns the composer chips, so it puts a restored item's images back.
  const stack = useMobileNativeChatImageRestoringQueue(controller.nativeChatQueue, images)
  return { folded: timedFolded, queue: { stack, willQueue: controller.nativeChatWillQueue } }
}
