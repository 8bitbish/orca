import { useMemo } from 'react'
import type { MobileNativeChatQueueStackProps } from './MobileNativeChatTerminalQueuedMessages'
import type { MobileNativeChatImageAttachments } from './native-chat/composer/use-mobile-native-chat-image-attachments'
import { queuedImagesWithPreviews } from './mobile-terminal-message-queue-previews'

/** The queue stack with restore also putting the item's images back as composer chips. */
export function useMobileNativeChatImageRestoringQueue(
  queue: MobileNativeChatQueueStackProps | null,
  images: MobileNativeChatImageAttachments
): MobileNativeChatQueueStackProps | null {
  return useMemo(
    () =>
      queue && {
        ...queue,
        onRestore: (item: { id: string; text: string; imagePaths?: string[] }, orphan: boolean) => {
          queue.onRestore(item, orphan)
          images.restoreImages?.(queuedImagesWithPreviews(item.imagePaths))
        }
      },
    [images, queue]
  )
}
