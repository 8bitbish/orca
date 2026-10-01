import { randomUUID } from 'node:crypto'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-ipc-payload'
import type {
  TerminalMessageQueueEditResult,
  TerminalMessageQueueEvent,
  TerminalMessageQueueSendNextResult,
  TerminalMessageQueueSession,
  TerminalMessageQueueSnapshot,
  TerminalMessageQueueStopResult,
  TerminalMessageQueueSubmitResult,
  TerminalQueuedMessage
} from '../../shared/terminal-message-queue-contract'
import {
  TerminalMessageQueue,
  type TerminalMessageQueueDeliveryOutcome
} from './terminal-message-queue'
import { readLeadTurnFromStatusRows, UNKNOWN_LEAD_TURN } from './terminal-message-queue-lead-turn'

export type TerminalMessageQueueTargetRef = {
  terminal?: string
  ptyId?: string
}

export type ResolvedTerminalMessageQueueTarget = {
  ptyId: string
  handle: string
}

/** The slice of the runtime the queue drives; the runtime owns every PTY write. */
export type TerminalMessageQueueRuntimePort = {
  resolveTarget: (ref: TerminalMessageQueueTargetRef) => ResolvedTerminalMessageQueueTarget | null
  paneKeyForPty: (ptyId: string) => string | null
  deliver: (
    target: ResolvedTerminalMessageQueueTarget,
    item: TerminalQueuedMessage,
    agent: string | null
  ) => Promise<TerminalMessageQueueDeliveryOutcome>
  interrupt: (target: ResolvedTerminalMessageQueueTarget) => Promise<boolean>
}

export type TerminalMessageQueueStatusSource = {
  readPaneRows: (paneKey: string) => AgentStatusIpcPayload[]
  subscribe: (listener: (paneKey: string) => void) => () => void
}

/** Calls `onTurnEnded` for each provider interrupt marker appended after the watch began. */
export type TerminalMessageQueueTranscriptWatch = (
  session: TerminalMessageQueueSession,
  onTurnEnded: () => void
) => () => void

/** How long an exited terminal's queue stays listable so a client can restore its items. */
const EXITED_QUEUE_RETENTION_MS = 30 * 60_000
const IDLE_QUEUE_RETENTION_MS = 60_000

type QueueEntry = {
  ptyId: string
  target: ResolvedTerminalMessageQueueTarget
  queue: TerminalMessageQueue
  session: TerminalMessageQueueSession | null
  stopTranscriptWatch: (() => void) | null
  retireTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Per-terminal queues on the execution host, keyed by PTY id.
 *
 * In memory only: a host restart drops queued items. Clients keep their last snapshot and offer
 * any item that vanished without being delivered or removed back to the composer.
 */
export class TerminalMessageQueueHost {
  private readonly entries = new Map<string, QueueEntry>()
  private statusSource: TerminalMessageQueueStatusSource | null = null
  private stopStatusSubscription: (() => void) | null = null

  constructor(
    private readonly runtime: TerminalMessageQueueRuntimePort,
    private readonly watchTranscript: TerminalMessageQueueTranscriptWatch | null = null
  ) {}

  attachStatusSource(source: TerminalMessageQueueStatusSource): void {
    this.stopStatusSubscription?.()
    this.statusSource = source
    this.stopStatusSubscription = source.subscribe((paneKey) => {
      for (const entry of this.entries.values()) {
        if (this.runtime.paneKeyForPty(entry.ptyId) === paneKey) {
          entry.queue.noteStatusChanged()
        }
      }
    })
  }

  submit(
    ref: TerminalMessageQueueTargetRef,
    session: TerminalMessageQueueSession | undefined,
    input: { text: string; imagePaths?: readonly string[] }
  ): TerminalMessageQueueSubmitResult {
    const entry = this.requireEntry(ref, session)
    const result = entry.queue.submit(input)
    this.refreshLifetime(entry)
    return result
  }

  list(ref: TerminalMessageQueueTargetRef): TerminalMessageQueueSnapshot {
    return this.requireEntry(ref).queue.snapshot()
  }

  remove(ref: TerminalMessageQueueTargetRef, itemId: string): TerminalMessageQueueSnapshot {
    const entry = this.requireEntry(ref)
    entry.queue.remove(itemId)
    this.refreshLifetime(entry)
    return entry.queue.snapshot()
  }

  edit(
    ref: TerminalMessageQueueTargetRef,
    itemId: string,
    change: { text?: string; editing?: boolean }
  ): TerminalMessageQueueEditResult {
    return this.requireEntry(ref).queue.edit(itemId, change)
  }

  async stop(
    ref: TerminalMessageQueueTargetRef,
    session?: TerminalMessageQueueSession
  ): Promise<TerminalMessageQueueStopResult> {
    const entry = this.requireEntry(ref, session)
    try {
      return await entry.queue.stop()
    } finally {
      this.refreshLifetime(entry)
    }
  }

  sendNext(ref: TerminalMessageQueueTargetRef): TerminalMessageQueueSendNextResult {
    return this.requireEntry(ref).queue.sendNext()
  }

  subscribe(
    ref: TerminalMessageQueueTargetRef,
    session: TerminalMessageQueueSession | undefined,
    listener: (event: TerminalMessageQueueEvent) => void
  ): () => void {
    const entry = this.requireEntry(ref, session)
    const unsubscribe = entry.queue.subscribe(listener)
    this.refreshLifetime(entry)
    return () => {
      unsubscribe()
      this.refreshLifetime(entry)
    }
  }

  /** `unverifiable` keeps the items queued: losing the host's view of a PTY is not its death. */
  onPtyExit(ptyId: string, verdict: 'exited' | 'unverifiable'): void {
    const entry = this.entries.get(ptyId)
    if (!entry) {
      return
    }
    entry.queue.noteTerminalExit(verdict)
    this.refreshLifetime(entry)
  }

  dispose(): void {
    this.stopStatusSubscription?.()
    for (const entry of this.entries.values()) {
      this.retire(entry)
    }
  }

  private requireEntry(
    ref: TerminalMessageQueueTargetRef,
    session?: TerminalMessageQueueSession
  ): QueueEntry {
    const resolved = this.runtime.resolveTarget(ref)
    const existing = resolved ? this.entries.get(resolved.ptyId) : this.findRetainedEntry(ref)
    // Why: an exited PTY no longer resolves, but its queue must stay readable for restore.
    if (existing) {
      if (resolved) {
        existing.target = resolved
      }
      this.adoptSession(existing, session)
      return existing
    }
    if (!resolved) {
      throw new Error('terminal_not_found')
    }
    const entry = this.createEntry(resolved)
    this.adoptSession(entry, session)
    return entry
  }

  private createEntry(target: ResolvedTerminalMessageQueueTarget): QueueEntry {
    const ptyId = target.ptyId
    const queue = new TerminalMessageQueue({
      now: () => Date.now(),
      newId: () => randomUUID(),
      readLeadTurn: () => {
        const paneKey = this.runtime.paneKeyForPty(ptyId)
        return paneKey && this.statusSource
          ? readLeadTurnFromStatusRows(this.statusSource.readPaneRows(paneKey))
          : UNKNOWN_LEAD_TURN
      },
      deliver: async (item) => {
        const entry = this.entries.get(ptyId)
        return entry
          ? this.runtime.deliver(entry.target, item, entry.session?.agent ?? null)
          : 'unverifiable'
      },
      interrupt: async () => {
        const entry = this.entries.get(ptyId)
        return entry ? this.runtime.interrupt(entry.target) : false
      }
    })
    const entry: QueueEntry = {
      ptyId,
      target,
      queue,
      session: null,
      stopTranscriptWatch: null,
      retireTimer: null
    }
    this.entries.set(ptyId, entry)
    return entry
  }

  private findRetainedEntry(ref: TerminalMessageQueueTargetRef): QueueEntry | undefined {
    if (ref.ptyId) {
      return this.entries.get(ref.ptyId)
    }
    for (const entry of this.entries.values()) {
      if (entry.target.handle === ref.terminal) {
        return entry
      }
    }
    return undefined
  }

  private adoptSession(entry: QueueEntry, session: TerminalMessageQueueSession | undefined): void {
    if (!session || !this.watchTranscript) {
      return
    }
    const current = entry.session
    if (
      current &&
      current.agent === session.agent &&
      current.sessionId === session.sessionId &&
      current.transcriptPath === session.transcriptPath
    ) {
      return
    }
    entry.stopTranscriptWatch?.()
    entry.session = session
    entry.stopTranscriptWatch = this.watchTranscript(session, () =>
      entry.queue.noteTranscriptTurnEnded()
    )
  }

  private refreshLifetime(entry: QueueEntry): void {
    if (entry.retireTimer) {
      clearTimeout(entry.retireTimer)
      entry.retireTimer = null
    }
    const exited = entry.queue.terminalVerdict === 'exited'
    if (!exited && (entry.queue.listenerCount > 0 || entry.queue.itemCount > 0)) {
      return
    }
    if (exited) {
      entry.stopTranscriptWatch?.()
      entry.stopTranscriptWatch = null
    }
    const retention = exited ? EXITED_QUEUE_RETENTION_MS : IDLE_QUEUE_RETENTION_MS
    entry.retireTimer = setTimeout(() => this.retire(entry), retention)
    entry.retireTimer.unref?.()
  }

  private retire(entry: QueueEntry): void {
    if (entry.retireTimer) {
      clearTimeout(entry.retireTimer)
    }
    entry.stopTranscriptWatch?.()
    entry.queue.dispose()
    if (this.entries.get(entry.ptyId) === entry) {
      this.entries.delete(entry.ptyId)
    }
  }
}
