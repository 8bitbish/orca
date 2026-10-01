import { useContext, useMemo, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ArrowUpRight } from 'lucide-react-native'
import { parseNativeChatProjectCardPayload } from '../../../../src/shared/native-chat-project-card-payload'
import { nativeChatProjectCardKey } from '../../../../src/shared/native-chat-project-card-choice'
import { AgentStateDot } from '../../components/AgentStateDot'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import {
  MOBILE_NATIVE_CHAT_PROJECT_STATUS_LABEL,
  type MobileNativeChatProjectStatus
} from './mobile-native-chat-project'
import {
  MobileNativeChatMessageIdContext,
  MobileNativeChatProjectsContext
} from './mobile-native-chat-project-context'
import { MobileNativeChatCardActions } from './MobileNativeChatCardActions'
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
      <MobileNativeChatCardActions
        actions={payload.actions}
        cardKey={cardKey}
        messageId={messageId}
        chat={projects}
      />
      {project.worktreeId ? (
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
      ) : null}
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
