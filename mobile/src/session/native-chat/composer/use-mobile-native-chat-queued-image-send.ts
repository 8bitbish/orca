import { useCallback } from 'react'
import type { MobileNativeChatImageAttachments } from './use-mobile-native-chat-image-attachments'
import {
  readMobileNativeChatDraftInputs,
  mobileNativeChatDraftDestination
} from './mobile-native-chat-draft-inputs'
import {
  routeMobileNativeChatImageSendToQueue,
  useMobileNativeChatRestoreImages,
  type MobileNativeChatImageQueueSend
} from './mobile-native-chat-queued-image-routing'

/** Offers a terminal chat's image send to the host queue before any paste, and lets a restored
 *  queued message put its images back as chips. */
export function useMobileNativeChatQueuedImageSend(
  images: MobileNativeChatImageAttachments,
  args: {
    readonly scopeKey: string | null
    readonly structuredNativeChat: boolean
    readonly queueSend?: MobileNativeChatImageQueueSend
    readonly onError?: () => void
  }
): MobileNativeChatImageAttachments {
  const { scopeKey, structuredNativeChat, queueSend, onError } = args
  const { attachments, sendNativeChat: pasteSend } = images
  const sendNativeChat = useCallback<MobileNativeChatImageAttachments['sendNativeChat']>(
    async (text, intent) => {
      const routable =
        queueSend && scopeKey && !structuredNativeChat && !intent?.queued && attachments.length > 0
      // Uploads still in flight: leave the refusal to the paste path.
      if (!routable || (readMobileNativeChatDraftInputs(scopeKey).pending ?? 0) > 0) {
        return pasteSend(text, intent)
      }
      // Why first: a held message must not also be pasted into the running turn.
      const queued = await routeMobileNativeChatImageSendToQueue(
        queueSend,
        { scope: mobileNativeChatDraftDestination(scopeKey), text, images: attachments },
        onError
      )
      return queued ?? pasteSend(text, intent)
    },
    [attachments, onError, pasteSend, queueSend, scopeKey, structuredNativeChat]
  )
  return { ...images, sendNativeChat, restoreImages: useMobileNativeChatRestoreImages(scopeKey) }
}
