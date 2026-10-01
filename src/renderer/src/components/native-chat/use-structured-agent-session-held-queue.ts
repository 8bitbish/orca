import { useCallback, useMemo, useState } from 'react'
import type { NativeChatBlock } from '../../../../shared/native-chat-types'
import type { StructuredAgentSessionOutboxEntry } from '../../../../shared/structured-agent-session-outbox'
import type {
  TerminalMessageQueueSnapshot,
  TerminalQueuedMessage
} from '../../../../shared/terminal-message-queue-contract'
import type { NativeChatComposerQueue } from './native-chat-composer-types'
import type { NativeChatQueuedMessagesProps } from './NativeChatQueuedMessages'
import { editedStructuredAgentSessionOutboxEntry } from './structured-agent-session-outbox-revision'

type Revise = (
  clientMessageId: string,
  update: (entry: StructuredAgentSessionOutboxEntry) => StructuredAgentSessionOutboxEntry | null
) => boolean

/** Only the stack's live rows exist here: nothing it holds is ever lost or left unsent. */
const NO_ORPHANS: NativeChatQueuedMessagesProps['orphans'] = []
const ignore = (): void => undefined
// The composer sends through the structured transport either way; the outbox does the holding.
const sendThroughTransport: NativeChatComposerQueue['enqueue'] = async () => 'direct'

function blockText(blocks: readonly NativeChatBlock[]): string {
  return blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n')
}

function blockImages(blocks: readonly NativeChatBlock[]): string[] {
  return blocks.flatMap((block) => (block.type === 'image-ref' && block.path ? [block.path] : []))
}

/** The outbox entries waiting for the running turn, as the stack's queued rows. */
function heldRow(entry: StructuredAgentSessionOutboxEntry): TerminalQueuedMessage {
  const imagePaths = blockImages(entry.body.blocks)
  return {
    id: entry.clientMessageId,
    text: blockText(entry.body.blocks),
    ...(imagePaths.length > 0 ? { imagePaths } : {}),
    queuedAt: entry.queuedAt,
    state: 'queued'
  }
}

/**
 * The structured chat's queue: messages sent while the agent's turn runs stay in this client's
 * outbox, one going out per turn end, and show in the same Queued stack the terminal chat uses,
 * with Edit and Remove. The outbox, not the host, holds them so each one enters the journal, and
 * the transcript, where it was really sent: after the turn it waited for.
 */
export function useStructuredAgentSessionHeldQueue(args: {
  outbox: readonly StructuredAgentSessionOutboxEntry[]
  blockedClientMessageId: string | null
  /** The session's own agent is working: a running turn, or a send it has not answered. */
  working: boolean
  turnId: string | null
  awaitingAnswer: boolean
  editingId: string | null
  setEditingId: (id: string | null) => void
  revise: Revise
}): {
  /** Held entries, which the transcript leaves to the stack. */
  heldIds: ReadonlySet<string>
  stackProps: NativeChatQueuedMessagesProps
  composerQueue: NativeChatComposerQueue
  /** A Stop was pressed: the stack says so until the turn it stopped has settled. */
  noteStop: () => void
} {
  const { blockedClientMessageId, editingId, revise, setEditingId, turnId, working } = args
  const [stopping, setStopping] = useState<{ turnId: string | null } | null>(null)
  // An edit keeps its message (and the ones behind it) here even once the turn has ended.
  const editing =
    editingId !== null &&
    args.outbox.some((entry) => entry.clientMessageId === editingId && entry.state === 'queued')
  const holding = working || editing
  const held = useMemo(
    () =>
      holding
        ? args.outbox.filter(
            (entry) =>
              entry.state === 'queued' &&
              entry.source !== 'launch' &&
              entry.lastFailure === undefined &&
              entry.clientMessageId !== blockedClientMessageId
          )
        : [],
    [args.outbox, blockedClientMessageId, holding]
  )
  const heldIds = useMemo(() => new Set(held.map((entry) => entry.clientMessageId)), [held])
  const snapshot = useMemo<TerminalMessageQueueSnapshot>(
    () => ({
      revision: 0,
      lead: args.awaitingAnswer ? 'dialog' : working ? 'working' : 'idle',
      interrupting: working && stopping !== null && stopping.turnId === turnId,
      terminal: 'live',
      items: held.map(heldRow)
    }),
    [args.awaitingAnswer, held, stopping, turnId, working]
  )
  const onRemove = useCallback(
    (id: string) => {
      if (editingId === id) {
        setEditingId(null)
      }
      revise(id, () => null)
    },
    [editingId, revise, setEditingId]
  )
  const onSetEditing = useCallback(
    (id: string, editing: boolean) => {
      if (editing) {
        setEditingId(id)
      } else if (editingId === id) {
        setEditingId(null)
      }
    },
    [editingId, setEditingId]
  )
  const onSaveEdit = useCallback(
    async (id: string, text: string) => {
      setEditingId(null)
      return revise(id, (entry) => editedStructuredAgentSessionOutboxEntry(entry, text))
    },
    [revise, setEditingId]
  )
  const composerQueue = useMemo(
    () => ({ willQueue: holding, enqueue: sendThroughTransport }),
    [holding]
  )
  const noteStop = useCallback(() => setStopping({ turnId }), [turnId])
  return {
    heldIds,
    stackProps: {
      snapshot,
      orphans: NO_ORPHANS,
      lastStop: null,
      onRemove,
      onSetEditing,
      onSaveEdit,
      onRestore: ignore,
      onDiscardOrphan: ignore,
      onSendNext: ignore
    },
    composerQueue,
    noteStop
  }
}
