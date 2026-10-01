import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  appendPendingSendCache,
  nextNativeChatPendingSendId,
  prunePendingSends,
  readPendingSendCache,
  writePendingSendCache,
  type NativeChatPendingSend
} from './native-chat-pending'

/**
 * Optimistic "queued" sends (mobile parity): a composer send is echoed immediately and pruned once
 * its real user turn lands in the transcript, so the message never vanishes between send and
 * transcript catch-up.
 */
export function useNativeChatPendingSends(args: {
  paneKey: string
  agent: string
  messages: NativeChatMessage[]
  liveWorking: boolean
  /** A send or a pane change: whatever Stop suppressed no longer applies. */
  onActivity: () => void
}): {
  pending: NativeChatPendingSend[]
  clearPending: () => void
  onOptimisticSend: (text: string, imagePaths?: string[]) => string
  onOptimisticSendCanceled: (pendingId: string) => void
  /** Echo a message the host queue just typed in; it opens the next turn, so it is never queued-tier. */
  appendDeliveredEcho: (text: string, imagePaths: string[]) => void
} {
  const { agent, liveWorking, messages, paneKey } = args
  const onActivityRef = useRef(args.onActivity)
  useLayoutEffect(() => {
    onActivityRef.current = args.onActivity
  })
  const pendingScope = useMemo(() => ({ paneKey, agent }), [paneKey, agent])
  const [pending, setPending] = useState<NativeChatPendingSend[]>(() =>
    readPendingSendCache(pendingScope)
  )
  // Reset the optimistic queue only when the pane/agent changes. A fresh launch
  // often learns its provider session id after the first send; clearing pending
  // on that transition briefly flashes the empty state before the transcript
  // user turn lands.
  useEffect(() => {
    setPending(readPendingSendCache(pendingScope))
    onActivityRef.current()
  }, [pendingScope])
  // Prune echoes whose real user turn is now in the transcript.
  useEffect(() => {
    setPending((prev) => writePendingSendCache(pendingScope, prunePendingSends(prev, messages)))
  }, [messages, pendingScope])

  const append = useCallback(
    (text: string, imagePaths: string[] | undefined, queuedWhileWorking: boolean): string => {
      onActivityRef.current()
      const sentAt = Date.now()
      const boundary = messages.at(-1)
      const entry: NativeChatPendingSend = {
        id: nextNativeChatPendingSendId(sentAt),
        text,
        sentAt,
        afterMessageId: boundary?.id ?? null,
        afterMessageTimestamp: boundary?.timestamp ?? null,
        ...(imagePaths ? { imagePaths } : {}),
        ...(queuedWhileWorking ? { queuedWhileWorking: true } : {})
      }
      setPending(appendPendingSendCache(pendingScope, entry))
      return entry.id
    },
    [messages, pendingScope]
  )
  // Sending into an already-working agent queues this prompt behind the
  // in-flight reply; sending while idle means that reply answers it.
  const onOptimisticSend = useCallback(
    (text: string, imagePaths?: string[]) => append(text, imagePaths, liveWorking),
    [append, liveWorking]
  )
  const appendDeliveredEcho = useCallback(
    (text: string, imagePaths: string[]) => {
      append(text, imagePaths.length > 0 ? imagePaths : undefined, false)
    },
    [append]
  )
  const onOptimisticSendCanceled = useCallback(
    (pendingId: string) => {
      // Why: detach/interrupt cancels the delayed Enter, so its optimistic echo
      // must not come back from the pane cache as a prompt that was delivered.
      const next = readPendingSendCache(pendingScope).filter((entry) => entry.id !== pendingId)
      setPending(writePendingSendCache(pendingScope, next))
    },
    [pendingScope]
  )
  const clearPending = useCallback(() => {
    setPending(writePendingSendCache(pendingScope, []))
  }, [pendingScope])
  return { pending, clearPending, onOptimisticSend, onOptimisticSendCanceled, appendDeliveredEcho }
}
