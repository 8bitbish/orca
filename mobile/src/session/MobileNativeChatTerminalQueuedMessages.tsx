import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { ListOrdered } from 'lucide-react-native'
import type {
  TerminalMessageQueueSnapshot,
  TerminalMessageQueueStopOutcome
} from '../../../src/shared/terminal-message-queue-contract'
import { colors } from '../theme/mobile-theme'
import { queueStyles as styles } from './mobile-native-chat-queue-styles'
import type { MobileQueuedMessageOrphan } from './mobile-terminal-message-queue-orphans'
import {
  MobileNativeChatQueuedMessageRow,
  type MobileQueuedRowItem
} from './MobileNativeChatQueuedMessageRow'

/** Renewed well inside the host's 2-minute lease so an open editor keeps holding the queue. */
const EDIT_LEASE_RENEW_MS = 60_000

export type MobileNativeChatQueueStackProps = {
  snapshot: TerminalMessageQueueSnapshot
  orphans: readonly MobileQueuedMessageOrphan[]
  lastStop: TerminalMessageQueueStopOutcome | null
  onRemove: (itemId: string) => void
  onSetEditing: (itemId: string, editing: boolean) => void
  onSaveEdit: (itemId: string, text: string) => Promise<boolean>
  onRestore: (item: { id: string; text: string; imagePaths?: string[] }, orphan: boolean) => void
  onDiscardOrphan: (itemId: string) => void
  onSendNext: () => void
}

/** What the chat view needs: the stack (null when empty), and whether a send now would queue. */
export type MobileNativeChatQueueSurface = {
  stack: MobileNativeChatQueueStackProps | null
  willQueue: boolean
}

function rowItems(
  snapshot: TerminalMessageQueueSnapshot,
  orphans: readonly MobileQueuedMessageOrphan[],
  editingId: string | null
): (MobileQueuedRowItem & { orphan: boolean })[] {
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
    return 'Stopping the agent…'
  }
  if (snapshot.lead === 'dialog') {
    return 'Waiting for you to answer the agent'
  }
  return 'Sends when the agent finishes'
}

/**
 * Messages the host holds until the agent's turn ends, stacked above the composer. Not bubbles in
 * the transcript: they are not sent yet, and they need Edit and Remove.
 */
export function MobileNativeChatTerminalQueuedMessages(
  props: MobileNativeChatQueueStackProps
): React.JSX.Element | null {
  const { snapshot, orphans, lastStop, onSetEditing } = props
  const [openEditorId, setOpenEditorId] = useState<string | null>(null)
  // Delivered or removed while open: the editor has nothing left to save into.
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

  if (items.length === 0 && !snapshot.interrupting) {
    return null
  }
  const showUnverifiableStop = lastStop === 'unverifiable' && pendingCount > 0
  return (
    <View style={styles.stack} accessibilityLabel="Queued messages">
      <View style={styles.header} accessibilityLiveRegion="polite">
        <ListOrdered size={13} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.heading}>{`Queued · ${pendingCount}`}</Text>
        {pendingCount > 0 ? (
          <Text style={styles.status} numberOfLines={1}>
            {statusLine(snapshot)}
          </Text>
        ) : null}
      </View>
      {showUnverifiableStop ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Couldn&apos;t confirm the agent stopped. Queued messages send when it finishes.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={props.onSendNext}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonLabel}>Send next now</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {items.map((item, index) => (
          <MobileNativeChatQueuedMessageRow
            key={item.id}
            item={item}
            position={index + 1}
            editing={editingId === item.id}
            onBeginEdit={() => {
              setOpenEditorId(item.id)
              onSetEditing(item.id, true)
            }}
            onCancelEdit={() => {
              setOpenEditorId(null)
              onSetEditing(item.id, false)
            }}
            onSaveEdit={(text) => {
              setOpenEditorId(null)
              void props.onSaveEdit(item.id, text)
            }}
            onRemove={() =>
              item.orphan ? props.onDiscardOrphan(item.id) : props.onRemove(item.id)
            }
            onRestore={() => props.onRestore(item, item.orphan)}
          />
        ))}
      </ScrollView>
    </View>
  )
}
