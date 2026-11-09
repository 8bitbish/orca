import { useCallback } from 'react'
import type { PendingNativeChatImage } from './mobile-native-chat-image-attachment'
import {
  addMobileNativeChatDraftImages,
  mobileNativeChatDraftDestination,
  removeMobileNativeChatDraftImages,
  type MobileNativeChatDraftDestination
} from './mobile-native-chat-draft-inputs'

export type MobileNativeChatImageQueueSend = (
  text: string,
  images: readonly PendingNativeChatImage[]
) => Promise<'queued' | 'direct' | 'rejected'>

export const NO_NATIVE_CHAT_IMAGE_ATTACHMENTS: PendingNativeChatImage[] = []

export type MobileNativeChatImagesByScope = Record<string, PendingNativeChatImage[]>

export function withScopeAttachments<List extends readonly unknown[]>(
  byScope: Readonly<Record<string, List>>,
  scope: string,
  next: List
): Record<string, List> {
  if (next.length > 0) {
    return { ...byScope, [scope]: next }
  }
  const remaining = { ...byScope }
  delete remaining[scope]
  return remaining
}

/** Puts a restored queued message's images back as chips on the active scope. */
export function restoreMobileNativeChatDraftImages(
  scopeKey: string | null,
  images: readonly Omit<PendingNativeChatImage, 'id'>[]
): void {
  if (scopeKey && images.length > 0) {
    addMobileNativeChatDraftImages(mobileNativeChatDraftDestination(scopeKey), [...images])
  }
}

/** Puts a restored queued message's images back as chips on the active scope. */
export function useMobileNativeChatRestoreImages(
  scopeKey: string | null
): (images: readonly Omit<PendingNativeChatImage, 'id'>[]) => void {
  return useCallback((images) => restoreMobileNativeChatDraftImages(scopeKey, images), [scopeKey])
}

/** Offers an image send to the host queue before any paste: true/false once the queue took or
 *  refused it, null when it should be pasted as usual. */
export async function routeMobileNativeChatImageSendToQueue(
  queueSend: MobileNativeChatImageQueueSend | undefined,
  send: {
    scope: MobileNativeChatDraftDestination | null
    text: string
    images: readonly PendingNativeChatImage[]
  },
  onError: (() => void) | undefined
): Promise<boolean | null> {
  const routed = queueSend ? await queueSend(send.text, send.images) : 'direct'
  if (routed === 'direct') {
    return null
  }
  if (routed === 'queued') {
    if (send.scope) {
      removeMobileNativeChatDraftImages(
        send.scope,
        send.images.map((image) => image.id)
      )
    }
  } else {
    onError?.()
  }
  return routed === 'queued'
}
