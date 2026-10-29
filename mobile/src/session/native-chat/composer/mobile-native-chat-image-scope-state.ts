import type { PendingNativeChatImage } from './mobile-native-chat-image-attachment'
import { createUuidV4 } from '../../../../../src/shared/uuid-v4'
import {
  updateMobileNativeChatDraftInputs,
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

/** Drops the given chips from one scope's draft; chips attached meanwhile stay. */
export function dropMobileNativeChatDraftImages(
  scope: string,
  images: readonly Pick<PendingNativeChatImage, 'id'>[]
): void {
  const dropped = new Set(images.map((image) => image.id))
  updateMobileNativeChatDraftInputs(scope, (current) => ({
    ...current,
    images: current.images.filter((attachment) => !dropped.has(attachment.id))
  }))
}

/** Adds images as chips on one scope's draft (uploads, or a restored queued message's images). */
export function addMobileNativeChatDraftImages(
  scope: string | MobileNativeChatDraftDestination | null,
  images: readonly Omit<PendingNativeChatImage, 'id'>[]
): void {
  if (scope && images.length > 0) {
    updateMobileNativeChatDraftInputs(scope, (current) => ({
      ...current,
      images: [...current.images, ...images.map((image) => ({ ...image, id: createUuidV4() }))]
    }))
  }
}

/** Offers an image send to the host queue before any paste: true/false once the queue took or
 *  refused it, null when it should be pasted as usual. */
export async function routeMobileNativeChatImageSendToQueue(
  queueSend: MobileNativeChatImageQueueSend | undefined,
  send: { scope: string; text: string; images: readonly PendingNativeChatImage[] },
  onError: (() => void) | undefined
): Promise<boolean | null> {
  const routed = queueSend ? await queueSend(send.text, send.images) : 'direct'
  if (routed === 'direct') {
    return null
  }
  if (routed === 'queued') {
    dropMobileNativeChatDraftImages(send.scope, send.images)
  } else {
    onError?.()
  }
  return routed === 'queued'
}
