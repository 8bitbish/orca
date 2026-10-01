import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  EMPTY_TERMINAL_MESSAGE_QUEUE_SNAPSHOT,
  type TerminalMessageQueueSession,
  type TerminalMessageQueueSnapshot,
  type TerminalMessageQueueStopOutcome,
  type TerminalQueuedMessage
} from '../../../src/shared/terminal-message-queue-contract'
import type { RpcClient } from '../transport/rpc-client'
import { terminalMessageQueueRpc } from './mobile-terminal-message-queue-operations'
import { subscribeMobileTerminalMessageQueue } from './mobile-terminal-message-queue-subscription'
import {
  findVanishedMobileQueueItems,
  readMobileQueueOrphans,
  writeMobileQueueOrphans,
  type MobileQueuedMessageOrphan
} from './mobile-terminal-message-queue-orphans'
import { useScopeKeyedState } from './use-scope-keyed-state'

export type MobileQueueSubmitOutcome =
  | 'queued'
  /** The agent is idle and nothing waits: send the way it always went. */
  | 'direct'
  | 'queue-full'
  | 'terminal-exited'
  /** The host answered with an error, so nothing was queued; a direct send is safe. */
  | 'unavailable'
  /** Never left the phone. */
  | 'not-sent'
  /** May be queued on the host; sending it again could deliver it twice. */
  | 'unknown'

export type MobileNativeChatMessageQueue = {
  /** The host holds mid-turn prompts for this terminal and the stream is live. */
  active: boolean
  snapshot: TerminalMessageQueueSnapshot
  orphans: MobileQueuedMessageOrphan[]
  /** A send now would be held: the main agent is mid-turn, a dialog is open, or items wait. */
  willQueue: boolean
  lastStop: TerminalMessageQueueStopOutcome | null
  submit: (text: string, imagePaths?: string[]) => Promise<MobileQueueSubmitOutcome>
  remove: (itemId: string) => void
  setEditing: (itemId: string, editing: boolean) => void
  saveEdit: (itemId: string, text: string) => Promise<boolean>
  /** 'host' when the host took the Stop; 'fallback' when the caller must interrupt as before. */
  stop: () => Promise<'host' | 'fallback' | 'unknown'>
  sendNext: () => void
  dismissOrphan: (itemId: string) => void
}

const RESUBSCRIBE_BASE_MS = 2_000
const RESUBSCRIBE_MAX_MS = 30_000

const emptySnapshot = (): TerminalMessageQueueSnapshot => EMPTY_TERMINAL_MESSAGE_QUEUE_SNAPSHOT
const noStop = (): TerminalMessageQueueStopOutcome | null => null
const storedOrphans = (scopeKey: string | null): MobileQueuedMessageOrphan[] =>
  scopeKey ? readMobileQueueOrphans(scopeKey) : []

function sessionKey(session: TerminalMessageQueueSession | null): string {
  return session
    ? `${session.agent}\u0000${session.sessionId}\u0000${session.transcriptPath ?? ''}`
    : ''
}

/** One terminal chat's host-side queue: subscription, lost-item tracking, and the user's actions. */
export function useMobileNativeChatMessageQueue(args: {
  client: RpcClient | null
  /** The host advertised terminal.message-queue.v1. */
  supported: boolean
  /** The host advertised terminal.message-queue-unsubscribe.v1. */
  unsubscribeSupported?: boolean
  /** Runtime handle of the chat's terminal; null when there is none to queue for. */
  terminal: string | null
  /** The chat tab this queue belongs to; lost items are kept per scope. */
  scopeKey: string | null
  session: TerminalMessageQueueSession | null
  /** First sight of an item being typed, before its transcript row can land. */
  onDeliveryStarted: (item: TerminalQueuedMessage) => void
  onDelivered: (item: TerminalQueuedMessage) => void
}): MobileNativeChatMessageQueue {
  const { client, supported, terminal, scopeKey } = args
  const unsubscribeSupported = args.unsubscribeSupported === true
  const sessionIdentity = sessionKey(args.session)
  const latest = useRef(args)
  useLayoutEffect(() => {
    latest.current = args
  })
  const [connected, setConnected] = useState(false)
  // Keyed by tab, so a tab switch never shows the previous tab's queue, stop or lost items.
  const [snapshot, updateSnapshot] = useScopeKeyedState(scopeKey, emptySnapshot)
  const [lastStop, updateLastStop] = useScopeKeyedState(scopeKey, noStop)
  const [orphans, updateOrphans] = useScopeKeyedState(scopeKey, storedOrphans)
  const revisionRef = useRef(-1)
  const retiredIdsRef = useRef(new Set<string>())
  const deliveringIdsRef = useRef(new Set<string>())
  // Why a ref reset per scope: items that left while another tab was shown were most likely
  // delivered; only a gap inside this tab's own watch (reconnect, new handle) counts as lost.
  const lastKnownRef = useRef<TerminalQueuedMessage[]>([])

  useEffect(() => {
    lastKnownRef.current = []
    retiredIdsRef.current = new Set()
    deliveringIdsRef.current = new Set()
    revisionRef.current = -1
  }, [scopeKey])

  // Not watching (chat hidden, tab gone): what changes meanwhile is not this client's to judge.
  const watching = terminal !== null
  useEffect(() => {
    if (!watching) {
      lastKnownRef.current = []
    }
  }, [watching])

  const applySnapshot = useCallback(
    (next: TerminalMessageQueueSnapshot, fromStream: boolean) => {
      // Stream frames are ordered; only a reply can race them with an older revision.
      if (!fromStream && next.revision < revisionRef.current) {
        return
      }
      revisionRef.current = next.revision
      const vanished = findVanishedMobileQueueItems({
        previous: lastKnownRef.current,
        next: next.items,
        retiredIds: retiredIdsRef.current,
        now: Date.now()
      })
      if (vanished.length > 0 && scopeKey) {
        // The store holds every tab's lost items; state only mirrors this tab's.
        const stored = writeMobileQueueOrphans(scopeKey, [
          ...readMobileQueueOrphans(scopeKey),
          ...vanished
        ])
        updateOrphans(() => stored)
      }
      lastKnownRef.current = next.items
      for (const item of next.items) {
        if (item.state === 'delivering' && !deliveringIdsRef.current.has(item.id)) {
          deliveringIdsRef.current.add(item.id)
          latest.current.onDeliveryStarted(item)
        }
      }
      updateSnapshot(() => next)
    },
    [scopeKey, updateOrphans, updateSnapshot]
  )

  useEffect(() => {
    setConnected(false)
    if (!client || !supported || !terminal) {
      return
    }
    let disposed = false
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let unsubscribe = (): void => {}
    const start = (): void => {
      const session = latest.current.session
      unsubscribe = subscribeMobileTerminalMessageQueue(
        client,
        terminal,
        session,
        unsubscribeSupported,
        {
          onEvent: (event) => {
            if (event.type === 'snapshot') {
              attempt = 0
              applySnapshot(event.snapshot, true)
              setConnected(true)
            } else if (event.type === 'delivered') {
              retiredIdsRef.current.add(event.item.id)
              updateLastStop(() => null)
              latest.current.onDelivered(event.item)
            } else {
              retiredIdsRef.current.add(event.itemId)
            }
          },
          onClosed: () => {
            if (disposed) {
              return
            }
            setConnected(false)
            const delay = Math.min(RESUBSCRIBE_BASE_MS * 2 ** attempt, RESUBSCRIBE_MAX_MS)
            attempt += 1
            retryTimer = setTimeout(start, delay)
          }
        }
      )
    }
    start()
    return () => {
      disposed = true
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
      unsubscribe()
    }
  }, [
    applySnapshot,
    client,
    sessionIdentity,
    supported,
    terminal,
    unsubscribeSupported,
    updateLastStop
  ])

  const active = supported && connected && client !== null && terminal !== null
  const rpc = useMemo(
    () => (active && client && terminal ? terminalMessageQueueRpc(client, terminal) : null),
    [active, client, terminal]
  )

  const submit = useCallback(
    async (text: string, imagePaths?: string[]): Promise<MobileQueueSubmitOutcome> => {
      if (!rpc) {
        return 'unavailable'
      }
      const session = latest.current.session
      const call = await rpc.submit({
        text,
        ...(imagePaths?.length ? { imagePaths } : {}),
        ...(session ? { session } : {})
      })
      if (call.status !== 'ok') {
        return call.status === 'refused' ? 'unavailable' : call.status
      }
      const result = call.value
      if (result.disposition === 'refused') {
        return result.reason
      }
      applySnapshot(result.snapshot, false)
      return result.disposition
    },
    [applySnapshot, rpc]
  )

  const remove = useCallback(
    (itemId: string) => {
      retiredIdsRef.current.add(itemId)
      void rpc?.remove(itemId).then((call) => {
        if (call.status === 'ok') {
          applySnapshot(call.value.snapshot, false)
        }
      })
    },
    [applySnapshot, rpc]
  )

  const setEditing = useCallback(
    (itemId: string, editing: boolean) => {
      void rpc?.edit(itemId, { editing }).then((call) => {
        if (call.status === 'ok') {
          applySnapshot(call.value.snapshot, false)
        }
      })
    },
    [applySnapshot, rpc]
  )

  const saveEdit = useCallback(
    async (itemId: string, text: string): Promise<boolean> => {
      const call = await rpc?.edit(itemId, { text })
      if (call?.status !== 'ok') {
        return false
      }
      applySnapshot(call.value.snapshot, false)
      return call.value.outcome === 'edited'
    },
    [applySnapshot, rpc]
  )

  const stop = useCallback(async (): Promise<'host' | 'fallback' | 'unknown'> => {
    if (!rpc) {
      return 'fallback'
    }
    updateLastStop(() => null)
    const call = await rpc.stop(latest.current.session ?? undefined)
    if (call.status === 'ok') {
      applySnapshot(call.value.snapshot, false)
      updateLastStop(() => call.value.outcome)
      return 'host'
    }
    // Only a definite "the host did nothing" may fall back to writing Escape here.
    return call.status === 'unknown' ? 'unknown' : 'fallback'
  }, [applySnapshot, rpc, updateLastStop])

  const sendNext = useCallback(() => {
    updateLastStop(() => null)
    void rpc?.sendNext().then((call) => {
      if (call.status === 'ok') {
        applySnapshot(call.value.snapshot, false)
      }
    })
  }, [applySnapshot, rpc, updateLastStop])

  const dismissOrphan = useCallback(
    (itemId: string) => {
      if (!scopeKey) {
        return
      }
      const stored = writeMobileQueueOrphans(
        scopeKey,
        readMobileQueueOrphans(scopeKey).filter((orphan) => orphan.id !== itemId)
      )
      updateOrphans(() => stored)
    },
    [scopeKey, updateOrphans]
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
    submit,
    remove,
    setEditing,
    saveEdit,
    stop,
    sendNext,
    dismissOrphan
  }
}
