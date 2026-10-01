import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { TerminalQueuedMessage } from '../../../src/shared/terminal-message-queue-contract'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileNativeChatResolution } from './mobile-native-chat-eligibility'
import type {
  MobileNativeChatAcceptSend,
  MobileNativeChatSendOrigin
} from './mobile-native-chat-pending-echo'
import { mobileQueueOrphanReachedTranscript } from './mobile-terminal-message-queue-orphans'
import {
  queuedImagesWithPreviews,
  rememberQueuedImagePreviews
} from './mobile-terminal-message-queue-previews'
import type { PendingNativeChatImage } from './mobile-native-chat-image-attachment'
import { classifyMobileNativeChatSend } from './mobile-native-chat-send-classification'
import { routeMobileNativeChatSendThroughQueue } from './mobile-native-chat-queue-send'
import type { MobileNativeChatQueueStackProps } from './MobileNativeChatQueuedMessages'
import {
  useMobileNativeChatMessageQueue,
  type MobileNativeChatMessageQueue
} from './use-mobile-native-chat-message-queue'

// A reconnect replays both streams; the transcript may land a beat after the queue snapshot, and
// a delivered item must not flash as "Not sent" in between.
const ORPHAN_GRACE_MS = 4_000

/** Binds a terminal chat to its host queue: delivered echoes, the stack, and draft restore.
 *  Restored images are re-attached by the overlay, which owns the composer's chips. */
export function useMobileNativeChatTerminalQueue(args: {
  client: RpcClient | null
  supported: boolean
  /** The terminal chat's transcript identity; null when the active chat is not terminal-backed. */
  resolution: MobileNativeChatResolution | null
  terminal: string | null
  scopeKey: string | null
  messages: readonly NativeChatMessage[]
  captureSendOrigin: (text: string) => MobileNativeChatSendOrigin | null
  acceptSend: MobileNativeChatAcceptSend
  clearDraftForSend: (origin: MobileNativeChatSendOrigin, text: string) => void
  setComposerText: Dispatch<SetStateAction<string>>
  onSendError: (message: string) => void
}): {
  queue: MobileNativeChatMessageQueue
  /** Offers an image send to the queue before its paste; 'direct' sends as before. The draft
   *  stays put until the host takes it, since the paste path that follows clears it itself. */
  queueImageSend: (
    text: string,
    images: readonly PendingNativeChatImage[]
  ) => Promise<'queued' | 'direct' | 'rejected'>
  /** Null while there is nothing to show; the composer then renders exactly as before. */
  stack: MobileNativeChatQueueStackProps | null
} {
  const { messages, resolution, setComposerText } = args
  const agent = resolution?.agent ?? null
  const sessionId = resolution?.sessionId ?? null
  const transcriptPath = resolution?.transcriptPath ?? null
  const latest = useRef(args)
  useLayoutEffect(() => {
    latest.current = args
  })
  const session = useMemo(
    () =>
      agent && sessionId
        ? { agent, sessionId, ...(transcriptPath ? { transcriptPath } : {}) }
        : null,
    [agent, sessionId, transcriptPath]
  )
  // Why captured at 'delivering': the host waits for the turn to start before it reports
  // `delivered`, so the transcript row can already be there and would never retire the echo.
  const originsRef = useRef(new Map<string, MobileNativeChatSendOrigin>())
  const onDeliveryStarted = useCallback((item: TerminalQueuedMessage) => {
    const origin = latest.current.captureSendOrigin(item.text)
    if (origin) {
      originsRef.current.set(item.id, origin)
    }
  }, [])
  const onDelivered = useCallback((item: TerminalQueuedMessage) => {
    const origin = originsRef.current.get(item.id) ?? latest.current.captureSendOrigin(item.text)
    originsRef.current.delete(item.id)
    const previews = queuedImagesWithPreviews(item.imagePaths).map((image) => image.previewUri)
    if (!origin || (item.text.trim() === '' && previews.length === 0)) {
      return
    }
    // It opens the next turn, so the reply below answers it: never the queued-while-working tier.
    latest.current.acceptSend(origin, item.text, previews.length > 0 ? previews : undefined, false)
  }, [])

  const queue = useMobileNativeChatMessageQueue({
    client: args.client,
    supported: args.supported && resolution !== null,
    terminal: resolution ? args.terminal : null,
    scopeKey: args.scopeKey,
    session,
    onDeliveryStarted,
    onDelivered
  })
  const { dismissOrphan, orphans, remove } = queue

  const [now, setNow] = useState(() => Date.now())
  const unsent = useMemo(
    () => orphans.filter((orphan) => !mobileQueueOrphanReachedTranscript(orphan, messages)),
    [messages, orphans]
  )
  useEffect(() => {
    for (const orphan of orphans) {
      if (!unsent.includes(orphan)) {
        dismissOrphan(orphan.id)
      }
    }
  }, [dismissOrphan, orphans, unsent])
  const maturing = unsent.filter((orphan) => now - orphan.detectedAt < ORPHAN_GRACE_MS)
  const nextMatureAt = maturing.length
    ? Math.min(...maturing.map((orphan) => orphan.detectedAt)) + ORPHAN_GRACE_MS
    : null
  useEffect(() => {
    if (nextMatureAt === null) {
      return
    }
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextMatureAt - Date.now()))
    return () => clearTimeout(timer)
  }, [nextMatureAt])
  const visibleOrphans = useMemo(
    () => unsent.filter((orphan) => now - orphan.detectedAt >= ORPHAN_GRACE_MS),
    [now, unsent]
  )

  const onRestore = useCallback(
    (item: { id: string; text: string }, orphan: boolean): void => {
      setComposerText((current) => (current.trim() === '' ? item.text : `${current}\n${item.text}`))
      if (orphan) {
        dismissOrphan(item.id)
      } else {
        remove(item.id)
      }
    },
    [dismissOrphan, remove, setComposerText]
  )

  const { active, submit } = queue
  const queueImageSend = useCallback(
    async (
      draftText: string,
      images: readonly PendingNativeChatImage[]
    ): Promise<'queued' | 'direct' | 'rejected'> => {
      const text = draftText.trimEnd()
      const origin = latest.current.captureSendOrigin(text)
      if (!active || !origin || classifyMobileNativeChatSend(agent, text) !== 'chat') {
        return 'direct'
      }
      const routed = await routeMobileNativeChatSendThroughQueue({
        submit,
        text,
        imagePaths: images.map((image) => image.path),
        onSendError: latest.current.onSendError
      })
      if (routed === 'queued') {
        rememberQueuedImagePreviews(images)
        latest.current.clearDraftForSend(origin, draftText)
      }
      return routed
    },
    [active, agent, submit]
  )

  const stackVisible =
    queue.active &&
    (queue.snapshot.items.length > 0 || queue.snapshot.interrupting || visibleOrphans.length > 0)
  const stack = useMemo<MobileNativeChatQueueStackProps | null>(
    () =>
      stackVisible
        ? {
            snapshot: queue.snapshot,
            orphans: visibleOrphans,
            lastStop: queue.lastStop,
            onRemove: queue.remove,
            onSetEditing: queue.setEditing,
            onSaveEdit: queue.saveEdit,
            onRestore,
            onDiscardOrphan: queue.dismissOrphan,
            onSendNext: queue.sendNext
          }
        : null,
    [onRestore, queue, stackVisible, visibleOrphans]
  )
  return { queue, queueImageSend, stack }
}
