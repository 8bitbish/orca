import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { Pencil, RotateCcw, X } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import { queueStyles as styles } from './mobile-native-chat-queue-styles'

/** One row of the stack: a live queued item, or one the host can no longer send. */
export type MobileQueuedRowItem = {
  id: string
  text: string
  imagePaths?: string[]
  status: 'queued' | 'delivering' | 'editing-elsewhere' | 'not-sent'
  notSentReason?: 'exited' | 'failed' | 'lost'
}

type RowProps = {
  item: MobileQueuedRowItem
  position: number
  editing: boolean
  onBeginEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (text: string) => void
  onRemove: () => void
  onRestore: () => void
}

function notSentLabel(reason: MobileQueuedRowItem['notSentReason']): string {
  if (reason === 'exited') {
    return 'Not sent — the terminal closed'
  }
  if (reason === 'failed') {
    return 'Not sent — delivery failed'
  }
  return 'Not sent — the queue was lost'
}

function IconAction(props: {
  label: string
  onPress: () => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled === true }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.iconButton,
        props.disabled && styles.disabled,
        pressed && styles.pressed
      ]}
    >
      {props.children}
    </Pressable>
  )
}

function QueuedMessageEditor(props: {
  initialText: string
  onCancel: () => void
  onSave: (text: string) => void
}): React.JSX.Element {
  const [text, setText] = useState(props.initialText)
  const empty = text.trim() === ''
  return (
    <View style={styles.editor}>
      <TextInput
        accessibilityLabel="Edit queued message"
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        style={styles.input}
        placeholderTextColor={colors.textMuted}
      />
      <View style={styles.editorButtons}>
        <Pressable
          accessibilityRole="button"
          onPress={props.onCancel}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonLabel}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: empty }}
          disabled={empty}
          onPress={() => props.onSave(text)}
          style={({ pressed }) => [
            styles.button,
            styles.buttonPrimary,
            empty && styles.disabled,
            pressed && styles.pressed
          ]}
        >
          <Text style={[styles.buttonLabel, styles.buttonLabelPrimary]}>Save</Text>
        </Pressable>
      </View>
    </View>
  )
}

export function MobileNativeChatQueuedMessageRow({
  item,
  position,
  editing,
  onBeginEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
  onRestore
}: RowProps): React.JSX.Element {
  const imageCount = item.imagePaths?.length ?? 0
  const notSent = item.status === 'not-sent'
  if (editing) {
    return (
      <View style={[styles.row, styles.rowEditing]}>
        <Text style={styles.position}>{position}</Text>
        <QueuedMessageEditor initialText={item.text} onCancel={onCancelEdit} onSave={onSaveEdit} />
      </View>
    )
  }
  return (
    <View style={styles.row}>
      <Text style={styles.position} accessibilityElementsHidden>
        {position}
      </Text>
      <View style={styles.body}>
        <Text
          style={[styles.text, notSent && styles.textNotSent]}
          numberOfLines={2}
          accessibilityLabel={`Queued message ${position}: ${item.text}`}
        >
          {item.text || (imageCount > 0 ? 'Image' : '')}
        </Text>
        {imageCount > 0 || item.status !== 'queued' ? (
          <View style={styles.meta}>
            {imageCount > 0 ? (
              <Text style={styles.metaText}>
                {imageCount === 1 ? '1 image' : `${imageCount} images`}
              </Text>
            ) : null}
            {item.status === 'delivering' ? (
              <>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={styles.metaText}>Sending…</Text>
              </>
            ) : null}
            {item.status === 'editing-elsewhere' ? (
              <Text style={styles.metaText}>Being edited on another device</Text>
            ) : null}
            {notSent ? (
              <Text style={styles.metaWarning}>{notSentLabel(item.notSentReason)}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {notSent ? (
          <IconAction label="Restore to composer" onPress={onRestore}>
            <RotateCcw size={17} color={colors.textSecondary} strokeWidth={2} />
          </IconAction>
        ) : (
          <IconAction
            label="Edit queued message"
            disabled={item.status !== 'queued'}
            onPress={onBeginEdit}
          >
            <Pencil size={16} color={colors.textSecondary} strokeWidth={2} />
          </IconAction>
        )}
        <IconAction
          label={notSent ? 'Discard message' : 'Remove from queue'}
          disabled={item.status === 'delivering'}
          onPress={onRemove}
        >
          <X size={18} color={colors.textSecondary} strokeWidth={2} />
        </IconAction>
      </View>
    </View>
  )
}
