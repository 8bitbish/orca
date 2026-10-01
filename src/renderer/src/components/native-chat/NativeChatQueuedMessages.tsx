import { useEffect, useMemo, useState } from 'react'
import { ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type {
  TerminalMessageQueueSnapshot,
  TerminalMessageQueueStopOutcome
} from '../../../../shared/terminal-message-queue-contract'
import type { NativeChatOrphanedQueuedMessage } from './native-chat-message-queue-orphans'
import {
  NativeChatQueuedMessageRow,
  type NativeChatQueuedRowItem
} from './NativeChatQueuedMessageRow'

/** Renewed well inside the host's 2-minute lease so an open editor keeps holding the queue. */
const EDIT_LEASE_RENEW_MS = 60_000

export type NativeChatQueuedMessagesProps = {
  snapshot: TerminalMessageQueueSnapshot
  orphans: readonly NativeChatOrphanedQueuedMessage[]
  lastStop: TerminalMessageQueueStopOutcome | null
  onRemove: (itemId: string) => void
  onSetEditing: (itemId: string, editing: boolean) => void
  onSaveEdit: (itemId: string, text: string) => Promise<boolean>
  onRestore: (item: { id: string; text: string; imagePaths?: string[] }, orphan: boolean) => void
  onDiscardOrphan: (itemId: string) => void
  onSendNext: () => void
}

function rowItems(
  snapshot: TerminalMessageQueueSnapshot,
  orphans: readonly NativeChatOrphanedQueuedMessage[],
  editingId: string | null
): (NativeChatQueuedRowItem & { orphan: boolean })[] {
  const live = snapshot.items.map((item) => ({
    id: item.id,
    text: item.text,
    ...(item.imagePaths ? { imagePaths: item.imagePaths } : {}),
    orphan: false,
    status:
      item.state === 'undeliverable'
        ? ('not-sent' as const)
        : item.state === 'delivering'
          ? ('delivering' as const)
          : item.editing && editingId !== item.id
            ? ('editing-elsewhere' as const)
            : ('queued' as const),
    ...(item.undeliverableReason ? { notSentReason: item.undeliverableReason } : {})
  }))
  const lost = orphans.map((orphan) => ({
    id: orphan.id,
    text: orphan.text,
    ...(orphan.imagePaths ? { imagePaths: orphan.imagePaths } : {}),
    orphan: true,
    status: 'not-sent' as const,
    notSentReason: orphan.reason
  }))
  return [...live, ...lost]
}

function statusLine(snapshot: TerminalMessageQueueSnapshot): string {
  if (snapshot.interrupting) {
    return translate('components.native-chat.queue.stopping', 'Stopping the agent…')
  }
  if (snapshot.lead === 'dialog') {
    return translate(
      'components.native-chat.queue.waitingOnDialog',
      'Waiting for you to answer the agent'
    )
  }
  return translate('components.native-chat.queue.sendsWhenDone', 'Sends when the agent finishes')
}

/**
 * Messages the host is holding until the agent's turn ends, stacked above the composer.
 * Why a stack and not bubbles in the transcript: these are not sent yet, and they need Edit and
 * Remove; the message list's tail is ordered by the transcript, which never holds them.
 */
export function NativeChatQueuedMessages(
  props: NativeChatQueuedMessagesProps
): React.JSX.Element | null {
  const { snapshot, orphans, lastStop, onSetEditing } = props
  const [openEditorId, setEditingId] = useState<string | null>(null)
  // Delivered or removed elsewhere while open: the editor has nothing left to save into.
  const editingId = snapshot.items.some(
    (item) => item.id === openEditorId && item.state === 'queued'
  )
    ? openEditorId
    : null
  const items = useMemo(
    () => rowItems(snapshot, orphans, editingId),
    [snapshot, orphans, editingId]
  )
  const pendingCount = items.filter((item) => item.status !== 'not-sent').length

  useEffect(() => {
    if (editingId === null) {
      return
    }
    const timer = setInterval(() => onSetEditing(editingId, true), EDIT_LEASE_RENEW_MS)
    return () => clearInterval(timer)
  }, [editingId, onSetEditing])

  const showUnverifiableStop = lastStop === 'unverifiable' && pendingCount > 0
  if (items.length === 0 && !snapshot.interrupting) {
    return null
  }
  return (
    <section
      aria-label={translate('components.native-chat.queue.label', 'Queued messages')}
      data-native-chat-queue="true"
      className="shrink-0 bg-background px-3 pt-2 sm:px-4"
    >
      <div className="mx-auto w-full max-w-3xl">
        <div
          aria-live="polite"
          className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <ListOrdered className="size-3" />
          <span className="text-[11px] font-semibold tracking-[0.05em] uppercase">
            {translate('components.native-chat.queue.heading', 'Queued · {{value0}}', {
              value0: pendingCount
            })}
          </span>
          {pendingCount > 0 ? <span>{statusLine(snapshot)}</span> : null}
        </div>
        {showUnverifiableStop ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {translate(
                'components.native-chat.queue.stopUnverifiable',
                "Couldn't confirm the agent stopped. Queued messages send when it finishes."
              )}
            </span>
            <Button type="button" variant="outline" size="xs" onClick={props.onSendNext}>
              {translate('components.native-chat.queue.sendNextNow', 'Send next now')}
            </Button>
          </div>
        ) : null}
        <ol className="scrollbar-sleek flex max-h-48 flex-col gap-1 overflow-y-auto">
          {items.map((item, index) => (
            <NativeChatQueuedMessageRow
              key={item.id}
              item={item}
              position={index + 1}
              editing={editingId === item.id}
              onBeginEdit={() => {
                setEditingId(item.id)
                onSetEditing(item.id, true)
              }}
              onCancelEdit={() => {
                setEditingId(null)
                onSetEditing(item.id, false)
              }}
              onSaveEdit={(text) => {
                setEditingId(null)
                void props.onSaveEdit(item.id, text)
              }}
              onRemove={() =>
                item.orphan ? props.onDiscardOrphan(item.id) : props.onRemove(item.id)
              }
              onRestore={() => props.onRestore(item, item.orphan)}
            />
          ))}
        </ol>
      </div>
    </section>
  )
}
