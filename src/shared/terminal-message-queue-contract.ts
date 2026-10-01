// Wire contract for the host-owned queue of prompts a user sends to a terminal agent mid-turn.
// The execution host holds and delivers them, so every client (desktop, mobile) sees one queue.

/** Hard caps keep a stuck queue from growing without bound on the host. */
export const TERMINAL_MESSAGE_QUEUE_MAX_ITEMS = 20
export const TERMINAL_MESSAGE_QUEUE_MAX_TEXT_LENGTH = 64_000
export const TERMINAL_MESSAGE_QUEUE_MAX_IMAGES = 10

export type TerminalQueuedMessageState = 'queued' | 'delivering' | 'undeliverable'

export type TerminalQueuedMessage = {
  id: string
  text: string
  imagePaths?: string[]
  queuedAt: number
  editedAt?: number
  state: TerminalQueuedMessageState
  /** Why an item can no longer be sent; the client offers it back to the composer. */
  undeliverableReason?: 'exited' | 'failed'
  /** Set while a client holds the edit lease; a held head blocks delivery so order holds. */
  editing?: boolean
}

/** What the host believes the main agent's own turn is doing (never the subagent-inclusive fold). */
export type TerminalMessageQueueLead = 'working' | 'idle' | 'dialog' | 'unknown'

/** `exited` needs host evidence the process ended; lost contact is only `unverifiable`. */
export type TerminalMessageQueueTerminalVerdict = 'live' | 'unverifiable' | 'exited'

export type TerminalMessageQueueSnapshot = {
  revision: number
  lead: TerminalMessageQueueLead
  /** True while the host is interrupting the current turn for a Stop. */
  interrupting: boolean
  terminal: TerminalMessageQueueTerminalVerdict
  items: TerminalQueuedMessage[]
}

/** Optional transcript identity so the host can read provider turn markers (Claude/Codex). */
export type TerminalMessageQueueSession = {
  agent: string
  sessionId: string
  transcriptPath?: string
}

export type TerminalMessageQueueSubmitResult =
  | {
      disposition: 'queued'
      item: TerminalQueuedMessage
      snapshot: TerminalMessageQueueSnapshot
    }
  // The agent is idle and nothing is waiting: the caller sends through its own path, as before.
  | { disposition: 'direct'; snapshot: TerminalMessageQueueSnapshot }
  | { disposition: 'refused'; reason: 'queue-full' | 'terminal-exited' }

export type TerminalMessageQueueEditResult = {
  outcome: 'edited' | 'held' | 'released' | 'not-found' | 'not-queued'
  snapshot: TerminalMessageQueueSnapshot
}

export type TerminalMessageQueueStopOutcome =
  /** The interrupt landed and the host saw the turn end; the next item (if any) was sent. */
  | 'turn-ended'
  /** No turn was running; the next item (if any) was sent straight away. */
  | 'not-working'
  /** The host could not confirm the turn ended in time; items stay queued for the next turn end. */
  | 'unverifiable'
  | 'exited'

export type TerminalMessageQueueSendNextResult = {
  outcome: 'sent' | 'empty' | 'held' | 'exited'
  snapshot: TerminalMessageQueueSnapshot
}

export type TerminalMessageQueueStopResult = {
  outcome: TerminalMessageQueueStopOutcome
  snapshot: TerminalMessageQueueSnapshot
}

export type TerminalMessageQueueEvent =
  | { type: 'snapshot'; snapshot: TerminalMessageQueueSnapshot }
  /** Emitted before the snapshot that drops the item, so a client can echo it as sent. */
  | { type: 'delivered'; item: TerminalQueuedMessage }
  | { type: 'removed'; itemId: string }
  | { type: 'end' }

export const EMPTY_TERMINAL_MESSAGE_QUEUE_SNAPSHOT: TerminalMessageQueueSnapshot = {
  revision: 0,
  lead: 'unknown',
  interrupting: false,
  terminal: 'live',
  items: []
}
