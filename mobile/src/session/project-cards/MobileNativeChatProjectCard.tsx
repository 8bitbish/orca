import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ArrowUpRight, Check, CornerDownLeft, Pencil } from 'lucide-react-native'
import {
  parseNativeChatProjectCardPayload,
  type NativeChatProjectCardAction
} from '../../../../src/shared/native-chat-project-card-payload'
import {
  deriveNativeChatProjectCardChoice,
  nativeChatProjectCardKey,
  type NativeChatProjectCardChoice
} from '../../../../src/shared/native-chat-project-card-choice'
import { AgentStateDot } from '../../components/AgentStateDot'
import { TEXT_INPUT_FONT_SIZE } from '../../platform/text-input-font-size'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import {
  MOBILE_NATIVE_CHAT_PROJECT_STATUS_LABEL,
  type MobileNativeChatProjectStatus
} from './mobile-native-chat-project'
import {
  MobileNativeChatMessageIdContext,
  MobileNativeChatProjectsContext,
  type MobileNativeChatProjects
} from './mobile-native-chat-project-context'
import {
  readMobileNativeChatProjectCardReply,
  recordMobileNativeChatProjectCardReply
} from './mobile-native-chat-project-card-replies'
import { mobileNativeChatProjectStatusDot } from './mobile-native-chat-project-status-dot'
import { MobileNativeChatProjectIcon } from './MobileNativeChatProjectIcon'

function StatusPill({ status }: { status: MobileNativeChatProjectStatus }): React.JSX.Element {
  return (
    <View
      style={[
        styles.pill,
        status === 'needs-you' ? styles.pillNeedsYou : null,
        status === 'unverifiable' ? styles.pillDashed : null
      ]}
    >
      <AgentStateDot state={mobileNativeChatProjectStatusDot(status)} />
      <Text
        style={[
          styles.pillText,
          status === 'needs-you' ? styles.pillTextNeedsYou : null,
          status === 'idle' || status === 'unverifiable' ? styles.muted : null
        ]}
      >
        {MOBILE_NATIVE_CHAT_PROJECT_STATUS_LABEL[status]}
      </Text>
    </View>
  )
}

/**
 * A ```project-card fence in a reply: the project's live status, the assistant's note
 * and ask, and reply actions that each show the exact text they send. Bad JSON or a
 * workspace the host does not list shows `fallback`, the raw block.
 */
export function MobileNativeChatProjectCard({
  source,
  fallback
}: {
  source: string
  fallback: ReactNode
}): React.JSX.Element {
  const projects = useContext(MobileNativeChatProjectsContext)
  const messageId = useContext(MobileNativeChatMessageIdContext)
  const payload = useMemo(() => parseNativeChatProjectCardPayload(source), [source])
  const project = payload && projects ? projects.resolve(payload.worktree) : null
  if (!payload || !project || !projects) {
    return <>{fallback}</>
  }
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  const title = project.workspace ? `${project.name} ${project.workspace}` : project.name
  return (
    <View
      style={styles.card}
      accessibilityLabel={`${title}, ${MOBILE_NATIVE_CHAT_PROJECT_STATUS_LABEL[project.status]}`}
    >
      <View style={styles.body}>
        <View style={styles.header}>
          <View style={styles.identity}>
            <MobileNativeChatProjectIcon repo={project.repo} payloadIcon={payload.icon} size={28} />
            <View style={styles.names}>
              <Text style={styles.name} numberOfLines={1}>
                {project.name}
              </Text>
              {project.workspace ? (
                <Text style={[styles.meta, styles.muted]} numberOfLines={1}>
                  {project.workspace}
                </Text>
              ) : null}
            </View>
          </View>
          <StatusPill status={project.status} />
        </View>
        {payload.note ? <Text style={styles.prose}>{payload.note}</Text> : null}
        {project.liveLine ? (
          <View style={styles.liveLine}>
            <Text style={[styles.meta, styles.muted, styles.flex]} numberOfLines={1}>
              {project.liveLine.text}
            </Text>
            {project.liveLine.time ? (
              <Text style={[styles.meta, styles.muted]}>· {project.liveLine.time}</Text>
            ) : null}
          </View>
        ) : null}
        {payload.ask ? (
          <View style={styles.ask}>
            <Text style={styles.prose}>{payload.ask}</Text>
          </View>
        ) : null}
      </View>
      <MobileNativeChatProjectCardActions
        actions={payload.actions}
        cardKey={cardKey}
        messageId={messageId}
        projects={projects}
      />
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
          onPress={() => projects.open(project)}
          style={({ pressed }) => [styles.openButton, pressed ? styles.pressed : null]}
        >
          <ArrowUpRight size={14} color={colors.textPrimary} />
          <Text style={styles.openText}>Open</Text>
        </Pressable>
      </View>
    </View>
  )
}

function MobileNativeChatProjectCardActions({
  actions,
  cardKey,
  messageId,
  projects
}: {
  actions: readonly NativeChatProjectCardAction[]
  cardKey: string | null
  messageId: string | undefined
  projects: MobileNativeChatProjects
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
        messages: projects.messages,
        messageId,
        recordedInput
      }),
    [actions, messageId, projects.messages, recordedInput]
  )
  if (actions.length === 0) {
    return null
  }
  const choice = sent ?? derived
  const locked = choice !== null || sending || !projects.canSend

  const send = async (actionIndex: number, text: string, record: boolean): Promise<void> => {
    if (locked || text.trim() === '') {
      return
    }
    setSending(true)
    const accepted = await projects.send(text)
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
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    backgroundColor: colors.bgRaised,
    overflow: 'hidden',
    marginVertical: spacing.sm
  },
  body: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    minWidth: 128
  },
  names: { flexShrink: 1 },
  name: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  meta: { fontSize: typography.metaSize },
  muted: { color: colors.textSecondary },
  prose: { color: colors.textPrimary, fontSize: typography.bodySize, lineHeight: 20 },
  bold: { fontWeight: '600' },
  flex: { flex: 1, minWidth: 0 },
  liveLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  ask: {
    borderLeftWidth: 2,
    borderLeftColor: colors.statusAmber,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.row,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2
  },
  pillNeedsYou: { borderColor: colors.statusRed, backgroundColor: colors.diffDeletedBg },
  pillDashed: { borderStyle: 'dashed' },
  pillText: { color: colors.textPrimary, fontSize: 11, fontWeight: '500' },
  pillTextNeedsYou: { fontWeight: '600' },
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
  disabled: { opacity: 0.5 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.button,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  openText: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '500' },
  pressed: { backgroundColor: colors.bgPanel }
})
