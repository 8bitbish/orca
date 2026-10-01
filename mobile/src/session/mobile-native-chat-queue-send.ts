import type { MobileQueueSubmitOutcome } from './use-mobile-native-chat-message-queue'

export type MobileNativeChatQueueSubmit = (
  text: string,
  imagePaths?: string[]
) => Promise<MobileQueueSubmitOutcome>

const QUEUE_REFUSAL_MESSAGES: Partial<Record<MobileQueueSubmitOutcome, string>> = {
  'queue-full': 'Message not sent (queue is full)',
  'terminal-exited': 'Message not sent (terminal closed)',
  'not-sent': 'Message not sent',
  // Why not a direct send: the host may already hold it, and both would be delivered.
  unknown: 'Queue unconfirmed — check the queue before resending'
}

/**
 * Offers a composer send to the host queue. 'queued': the host holds it (no echo until delivered).
 * 'direct': send it the way it always went. 'rejected': reported; the caller restores the draft.
 */
export async function routeMobileNativeChatSendThroughQueue(args: {
  submit: MobileNativeChatQueueSubmit
  text: string
  imagePaths?: string[]
  onSendError: (message: string) => void
}): Promise<'queued' | 'direct' | 'rejected'> {
  const outcome = await args.submit(args.text, args.imagePaths)
  if (outcome === 'queued') {
    return 'queued'
  }
  if (outcome === 'direct' || outcome === 'unavailable') {
    return 'direct'
  }
  args.onSendError(QUEUE_REFUSAL_MESSAGES[outcome] ?? 'Message not sent')
  return 'rejected'
}

/** A composer send offered to the queue: the draft clears at send time and comes back on refusal.
 *  On 'direct' it stays cleared for the send path that follows. */
export async function offerMobileNativeChatSendToQueue<Origin>(args: {
  submit: MobileNativeChatQueueSubmit
  text: string
  draftText: string
  origin: Origin
  clearDraft: (origin: Origin, draftText: string) => void
  restoreDraft: (origin: Origin, draftText: string) => void
  onSendError: (message: string) => void
}): Promise<'queued' | 'direct' | 'rejected'> {
  args.clearDraft(args.origin, args.draftText)
  const routed = await routeMobileNativeChatSendThroughQueue(args)
  if (routed === 'rejected') {
    args.restoreDraft(args.origin, args.draftText)
  }
  return routed
}
