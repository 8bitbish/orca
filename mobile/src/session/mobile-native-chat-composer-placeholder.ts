import type { MobileNativeChatInputLockReason } from './MobileNativeChatView'

/** The composer's hint: why input is locked, or that a send now waits in the host's queue. */
export function mobileNativeChatComposerPlaceholder(
  lockReason: MobileNativeChatInputLockReason | null,
  willQueue: boolean
): string {
  if (lockReason === 'disconnected') {
    return 'Reconnecting…'
  }
  if (lockReason === 'waiting') {
    return 'Waiting for terminal…'
  }
  return willQueue ? 'Queue a message for when it finishes' : 'Message, @files, /commands'
}
