import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Check, CornerDownLeft, Pencil } from 'lucide-react-native'
import type { NativeChatCardAction } from '../../../../src/shared/native-chat-card-actions'
import {
  deriveNativeChatProjectCardChoice,
  type NativeChatProjectCardChoice
} from '../../../../src/shared/native-chat-project-card-choice'
import { TEXT_INPUT_FONT_SIZE } from '../../platform/text-input-font-size'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import type { MobileNativeChatProjects } from './mobile-native-chat-project-context'
import {
  readMobileNativeChatProjectCardReply,
  recordMobileNativeChatProjectCardReply
} from './mobile-native-chat-project-card-replies'

export type MobileNativeChatCardChat = Pick<
  MobileNativeChatProjects,
  'messages' | 'send' | 'canSend'
>

/**
 * A chat card's reply buttons (project and Slack cards). Each shows the exact text it
 * sends as the user's next chat message; once one is chosen they all lock.
 */
export function MobileNativeChatCardActions({
  actions,
  cardKey,
  messageId,
  chat
}: {
  actions: readonly NativeChatCardAction[]
  cardKey: string | null
  messageId: string | undefined
  chat: MobileNativeChatCardChat
}): React.JSX.Element | null {
  const [sent, setSent] = useState<NativeChatProjectCardChoice | null>(null)
  const [sending, setSending] = useState(false)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [recordedInput, setRecordedInput] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (cardKey) {
      void readMobileNativeChatProjectCardReply(cardKey).then((text) => {
        if (!cancelled) {
          setRecordedInput(text)
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [cardKey])
  const derived = useMemo(
    () =>
      deriveNativeChatProjectCardChoice({
        actions,
        messages: chat.messages,
        messageId,
        recordedInput
      }),
    [actions, messageId, chat.messages, recordedInput]
  )
  if (actions.length === 0) {
    return null
  }
  const choice = sent ?? derived
  const locked = choice !== null || sending || !chat.canSend

  const send = async (actionIndex: number, text: string, record: boolean): Promise<void> => {
    if (locked || text.trim() === '') {
      return
    }
    setSending(true)
    const accepted = await chat.send(text)
    setSending(false)
    if (!accepted) {
      return
    }
    if (record && cardKey) {
      void recordMobileNativeChatProjectCardReply(cardKey, text)
    }
    setTyping(false)
    setSent({ actionIndex, text })
  }

  return (
    <View accessibilityLabel="Replies" style={styles.actions}>
      {actions.map((action, index) => {
        const chosen = choice?.actionIndex === index
        if (action.kind === 'input' && typing && !locked) {
          return (
            <View key={action.id} style={[styles.action, styles.inputRow]}>
              <View style={styles.badge}>
                <Pencil size={13} color={colors.textSecondary} />
              </View>
              <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                accessibilityLabel={action.label}
                placeholder="Type your answer"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                onSubmitEditing={() => void send(index, draft.trim(), true)}
                returnKeyType="send"
              />
              <Pressable
                accessibilityRole="button"
                disabled={draft.trim() === ''}
                onPress={() => void send(index, draft.trim(), true)}
                style={[styles.sendButton, draft.trim() === '' ? styles.disabled : null]}
              >
                <CornerDownLeft size={12} color={colors.bgBase} />
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            </View>
          )
        }
        const sendsText = action.kind === 'reply' ? action.reply : chosen ? choice.text : null
        return (
          <Pressable
            key={action.id}
            accessibilityRole="button"
            accessibilityState={{ disabled: locked, selected: chosen }}
            disabled={locked}
            onPress={() =>
              action.kind === 'reply' ? void send(index, action.reply, false) : setTyping(true)
            }
            style={({ pressed }) => [
              styles.action,
              chosen || pressed ? styles.actionChosen : null,
              locked && !chosen ? styles.disabled : null
            ]}
          >
            <View style={[styles.badge, chosen ? styles.badgeChosen : null]}>
              {chosen ? (
                <Check size={13} strokeWidth={3} color={colors.bgBase} />
              ) : action.kind === 'input' ? (
                <Pencil size={13} color={colors.textSecondary} />
              ) : (
                <Text style={[styles.meta, styles.muted]}>{index + 1}</Text>
              )}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.prose, action.style === 'primary' ? styles.bold : null]}>
                {action.label}
              </Text>
              <Text style={[styles.meta, styles.muted]} numberOfLines={3}>
                {sendsText !== null
                  ? `${chosen ? 'Sent' : 'Sends'} “${sendsText}”`
                  : 'Type a reply to send'}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  meta: { fontSize: typography.metaSize },
  muted: { color: colors.textSecondary },
  prose: { color: colors.textPrimary, fontSize: typography.bodySize, lineHeight: 20 },
  bold: { fontWeight: '600' },
  flex: { flex: 1, minWidth: 0 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  action: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  actionChosen: { backgroundColor: colors.bgPanel },
  inputRow: { alignItems: 'center' },
  badge: {
    width: 24,
    height: 24,
    borderRadius: radii.row,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPanel
  },
  badgeChosen: { backgroundColor: colors.surfaceBright },
  input: { flex: 1, color: colors.textPrimary, fontSize: TEXT_INPUT_FONT_SIZE, paddingVertical: 4 },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceBright,
    paddingHorizontal: spacing.md,
    paddingVertical: 6
  },
  sendText: { color: colors.bgBase, fontSize: typography.metaSize, fontWeight: '600' },
  disabled: { opacity: 0.5 }
})
