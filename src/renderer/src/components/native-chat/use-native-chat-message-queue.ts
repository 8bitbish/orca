import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  EMPTY_TERMINAL_MESSAGE_QUEUE_SNAPSHOT,
  type TerminalMessageQueueSession,
  type TerminalMessageQueueSnapshot,
  type TerminalMessageQueueStopOutcome,
  type TerminalQueuedMessage
} from '../../../../shared/terminal-message-queue-contract'
import {
  subscribeTerminalMessageQueue,
  supportsTerminalMessageQueue,
  terminalMessageQueueClient,
  terminalMessageQueueTargetForPty
} from '@/runtime/terminal-message-queue-client'
import {
  findVanishedQueueItems,
  readLastKnownQueueItems,
  readQueueOrphans,
  writeLastKnownQueueItems,
  writeQueueOrphans,
  type NativeChatOrphanedQueuedMessage
} from './native-chat-message-queue-orphans'

export type NativeChatQueueEnqueueOutcome = 'queued' | 'direct' | 'refused' | 'failed'

export type NativeChatMessageQueue = {
  /** The host supports the queue and this pane is subscribed to it. */
  active: boolean
  snapshot: TerminalMessageQueueSnapshot
  orphans: NativeChatOrphanedQueuedMessage[]
  /** A send now would be held: the main agent is mid-turn, a dialog is open, or items wait. */
  willQueue: boolean
  lastStop: TerminalMessageQueueStopOutcome | null
  enqueue: (text: string, imagePaths: string[]) => Promise<NativeChatQueueEnqueueOutcome>
  remove: (itemId: string) => void
  setEditing: (itemId: string, editing: boolean) => void
  saveEdit: (itemId: string, text: string) => Promise<boolean>
  /** Interrupts the turn on the host; false when the host has no queue (caller stops as before). */
  stop: () => boolean
  sendNext: () => void
  dismissOrphan: (itemId: string) => void
}

const RESUBSCRIBE_DELAY_MS = 2_000

function sessionKey(session: TerminalMessageQueueSession | null): string {
  return session
    ? `${session.agent}\u0000${session.sessionId}\u0000${session.transcriptPath ?? ''}`
    : ''
}

/** The pane's host-side message queue: subscription, orphan tracking, and the user's actions. */
export function useNativeChatMessageQueue(args: {
  paneKey: string
  ptyId: string | null
  session: TerminalMessageQueueSession | null
  onDelivered: (item: TerminalQueuedMessage) => void
}): NativeChatMessageQueue {
  const { paneKey, ptyId } = args
  const target = useMemo(() => (ptyId ? terminalMessageQueueTargetForPty(ptyId) : null), [ptyId])
  const sessionIdentity = sessionKey(args.session)
  const sessionRef = useRef(args.session)
  const onDeliveredRef = useRef(args.onDelivered)
  useLayoutEffect(() => {
    sessionRef.current = args.session
    onDeliveredRef.current = args.onDelivered
  })

  const [supported, setSupported] = useState(false)
  const [connected, setConnected] = useState(false)
  const [snapshot, setSnapshot] = useState(EMPTY_TERMINAL_MESSAGE_QUEUE_SNAPSHOT)
  const [orphans, setOrphans] = useState(() => readQueueOrphans(paneKey))
  const [lastStop, setLastStop] = useState<TerminalMessageQueueStopOutcome | null>(null)
  const revisionRef = useRef(-1)
  const retiredIdsRef = useRef(new Set<string>())

  useEffect(() => {
    setOrphans(readQueueOrphans(paneKey))
  }, [paneKey])

  const applySnapshot = useCallback(
    (next: TerminalMessageQueueSnapshot, fresh: boolean) => {
      // Why: replies and stream frames race; an older revision must not resurrect removed items.
      if (!fresh && next.revision < revisionRef.current) {
        return
      }
      revisionRef.current = next.revision
      const vanished = findVanishedQueueItems({
        previous: readLastKnownQueueItems(paneKey),
        next: next.items,
        retiredIds: retiredIdsRef.current
      })
      if (vanished.length > 0) {
        setOrphans((previous) => writeQueueOrphans(paneKey, [...previous, ...vanished]))
      }
      writeLastKnownQueueItems(paneKey, next.items)
      setSnapshot(next)
    },
    [paneKey]
  )

  useEffect(() => {
    let cancelled = false
    setSupported(false)
    if (target) {
      void supportsTerminalMessageQueue(target).then((ok) => {
        if (!cancelled) {
          setSupported(ok)
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [target])

  useEffect(() => {
    if (!supported || !target) {
      return
    }
    const queueTarget = target
    let disposed = false
    let unsubscribe = (): void => {}
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRetry = (): void => {
      if (disposed) {
        return
      }
      setConnected(false)
      unsubscribe()
      unsubscribe = () => {}
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
      retryTimer = setTimeout(start, RESUBSCRIBE_DELAY_MS)
    }
    function start(): void {
      let first = true
      void subscribeTerminalMessageQueue(queueTarget, sessionRef.current ?? undefined, {
        onEvent: (event) => {
          if (disposed) {
            return
          }
          if (event.type === 'snapshot') {
            applySnapshot(event.snapshot, first)
            first = false
            setConnected(true)
          } else if (event.type === 'delivered') {
            retiredIdsRef.current.add(event.item.id)
            setLastStop(null)
            onDeliveredRef.current(event.item)
          } else if (event.type === 'removed') {
            retiredIdsRef.current.add(event.itemId)
          }
        },
        onError: scheduleRetry,
        onClose: scheduleRetry
      }).then((subscription) => {
        if (disposed) {
          subscription.unsubscribe()
        } else {
          unsubscribe = subscription.unsubscribe
        }
      }, scheduleRetry)
    }
    start()
    return () => {
      disposed = true
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
      unsubscribe()
      setConnected(false)
    }
  }, [applySnapshot, sessionIdentity, supported, target])

  const active = supported && connected
  const run = useCallback(
    <T>(action: (queueTarget: NonNullable<typeof target>) => Promise<T>): Promise<T | null> => {
      if (!target || !active) {
        return Promise.resolve(null)
      }
      return action(target).catch((error: unknown) => {
        console.warn('[native-chat] message queue call failed', error)
        return null
      })
    },
    [active, target]
  )

  const enqueue = useCallback(
    async (text: string, imagePaths: string[]): Promise<NativeChatQueueEnqueueOutcome> => {
      const session = sessionRef.current
      const result = await run((queueTarget) =>
        terminalMessageQueueClient.submit(queueTarget, {
          text,
          ...(imagePaths.length > 0 ? { imagePaths } : {}),
          ...(session ? { session } : {})
        })
      )
      if (!result) {
        return 'failed'
      }
      if (result.disposition !== 'refused') {
        applySnapshot(result.snapshot, false)
      }
      return result.disposition
    },
    [applySnapshot, run]
  )

  const remove = useCallback(
    (itemId: string) => {
      retiredIdsRef.current.add(itemId)
      void run((queueTarget) => terminalMessageQueueClient.remove(queueTarget, itemId)).then(
        (result) => result && applySnapshot(result.snapshot, false)
      )
    },
    [applySnapshot, run]
  )

  const setEditing = useCallback(
    (itemId: string, editing: boolean) => {
      void run((queueTarget) =>
        terminalMessageQueueClient.edit(queueTarget, itemId, { editing })
      ).then((result) => result && applySnapshot(result.snapshot, false))
    },
    [applySnapshot, run]
  )

  const saveEdit = useCallback(
    async (itemId: string, text: string): Promise<boolean> => {
      const result = await run((queueTarget) =>
        terminalMessageQueueClient.edit(queueTarget, itemId, { text })
      )
      if (!result) {
        return false
      }
      applySnapshot(result.snapshot, false)
      return result.outcome === 'edited'
    },
    [applySnapshot, run]
  )

  const stop = useCallback((): boolean => {
    if (!target || !active) {
      return false
    }
    setLastStop(null)
    void run((queueTarget) =>
      terminalMessageQueueClient.stop(queueTarget, sessionRef.current ?? undefined)
    ).then((result) => {
      if (result) {
        applySnapshot(result.snapshot, false)
        setLastStop(result.outcome)
      }
    })
    return true
  }, [active, applySnapshot, run, target])

  const sendNext = useCallback(() => {
    setLastStop(null)
    void run((queueTarget) => terminalMessageQueueClient.sendNext(queueTarget)).then(
      (result) => result && applySnapshot(result.snapshot, false)
    )
  }, [applySnapshot, run])

  const dismissOrphan = useCallback(
    (itemId: string) => {
      setOrphans((previous) =>
        writeQueueOrphans(
          paneKey,
          previous.filter((orphan) => orphan.id !== itemId)
        )
      )
    },
    [paneKey]
  )

  const visible = active ? snapshot : EMPTY_TERMINAL_MESSAGE_QUEUE_SNAPSHOT
  const willQueue =
    active &&
    (visible.lead === 'working' ||
      visible.lead === 'dialog' ||
      visible.interrupting ||
      visible.items.some((item) => item.state !== 'undeliverable'))

  return {
    active,
    snapshot: visible,
    orphans,
    willQueue,
    lastStop,
    enqueue,
    remove,
    setEditing,
    saveEdit,
    stop,
    sendNext,
    dismissOrphan
  }
}
