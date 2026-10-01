import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ArrowUpRight } from 'lucide-react-native'
import {
  nativeChatSlackConversationTarget,
  nativeChatSlackPersonTarget,
  type NativeChatSlackConversation,
  type NativeChatSlackPerson
} from '../../../../src/shared/native-chat-slack-card-payload'
import type { NativeChatSlackTarget } from '../../../../src/shared/native-chat-slack-href'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import { MobileNativeChatSlackTargetChip } from './MobileNativeChatSlackChip'
import { openMobileNativeChatSlackTarget } from './mobile-native-chat-slack-open'

type CardWorkspace = { teamId: string; domain?: string; permalink?: string }

export type MobileNativeChatSlackPillTone = 'needs-you' | 'fyi' | 'draft'

const PILL_LABEL: Record<MobileNativeChatSlackPillTone, string> = {
  'needs-you': 'Needs you',
  fyi: 'FYI',
  draft: 'Draft, not sent'
}

export function MobileNativeChatSlackPill({
  tone
}: {
  tone: MobileNativeChatSlackPillTone
}): React.JSX.Element {
  return (
    <View
      style={[
        styles.pill,
        tone === 'needs-you' ? styles.pillNeedsYou : null,
        tone === 'draft' ? styles.pillDraft : null
      ]}
    >
      <View
        style={[
          styles.dot,
          {
            backgroundColor:
              tone === 'needs-you'
                ? colors.statusRed
                : tone === 'draft'
                  ? colors.statusAmber
                  : colors.textMuted
          }
        ]}
      />
      <Text style={[styles.pillText, tone === 'fyi' ? styles.muted : styles.bold]}>
        {PILL_LABEL[tone]}
      </Text>
    </View>
  )
}

/** A person as a chip when the card gave their user id, else just their name. */
export function MobileNativeChatSlackPersonName({
  card,
  person
}: {
  card: CardWorkspace
  person: NativeChatSlackPerson
}): React.JSX.Element {
  const target = nativeChatSlackPersonTarget(card, person)
  return target ? (
    <MobileNativeChatSlackTargetChip
      raised
      textSize={typography.metaSize}
      target={target}
      label={person.name}
    />
  ) : (
    <Text style={styles.bold}>{person.name}</Text>
  )
}

export function mobileNativeChatSlackConversationLabel(
  conversation: NativeChatSlackConversation
): string {
  if (conversation.kind === 'channel') {
    return `#${conversation.name ?? conversation.id}`
  }
  return conversation.name ?? (conversation.kind === 'dm' ? 'Direct message' : 'Group')
}

export function MobileNativeChatSlackConversationChip({
  card,
  conversation
}: {
  card: CardWorkspace
  conversation: NativeChatSlackConversation
}): React.JSX.Element {
  return (
    <MobileNativeChatSlackTargetChip
      raised
      textSize={typography.metaSize}
      target={nativeChatSlackConversationTarget(card, conversation)}
      label={mobileNativeChatSlackConversationLabel(conversation)}
    />
  )
}

/** The card's sent time: the clock today, else the date as well. */
export function formatMobileNativeChatSlackSentAt(sentAt: string, now = new Date()): string {
  const date = new Date(sentAt)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return date.toDateString() === now.toDateString()
    ? time
    : `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`
}

export function MobileNativeChatSlackOpenButton({
  target
}: {
  target: NativeChatSlackTarget
}): React.JSX.Element {
  return (
    <View style={styles.footer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open in Slack"
        onPress={() => void openMobileNativeChatSlackTarget(target)}
        style={({ pressed }) => [styles.openButton, pressed ? styles.pressed : null]}
      >
        <ArrowUpRight size={14} color={colors.textPrimary} />
        <Text style={styles.openText}>Open in Slack</Text>
      </Pressable>
    </View>
  )
}

export const slackCardStyles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    backgroundColor: colors.bgRaised,
    overflow: 'hidden',
    marginVertical: spacing.sm
  },
  body: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  line: { flexShrink: 1, color: colors.textPrimary, fontSize: typography.metaSize, lineHeight: 20 },
  muted: { color: colors.textSecondary },
  summary: { color: colors.textPrimary, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: typography.metaSize },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.borderSubtle,
    paddingLeft: 10
  }
})

const styles = StyleSheet.create({
  muted: { color: colors.textSecondary },
  bold: { fontWeight: '600' },
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
  pillDraft: { borderColor: colors.statusAmber, borderStyle: 'dashed' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { color: colors.textPrimary, fontSize: 11 },
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
