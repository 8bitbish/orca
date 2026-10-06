import { useContext, useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  ArrowUpRight,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  CodeXml,
  Globe,
  Monitor,
  PenTool,
  Smartphone
} from 'lucide-react-native'
import type {
  NativeChatProofCheck,
  NativeChatProofKind,
  NativeChatProofLink
} from '../../../../src/shared/native-chat-proof-card-payload'
import { parseNativeChatProofCard } from '../../../../src/shared/native-chat-proof-card-reader'
import { nativeChatProjectCardKey } from '../../../../src/shared/native-chat-project-card-choice'
import { NATIVE_CHAT_WORKTREE_LINK_SCHEME } from '../../../../src/shared/native-chat-project-target'
import { openExternalLink } from '../../platform/external-link'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import {
  MobileNativeChatMessageIdContext,
  MobileNativeChatProjectsContext
} from '../project-cards/mobile-native-chat-project-context'
import { MobileNativeChatCardActions } from '../project-cards/MobileNativeChatCardActions'
import { MobileNativeChatProjectChip } from '../project-cards/MobileNativeChatProjectChip'
import { MobileNativeChatProofViewer } from './MobileNativeChatProofMedia'
import {
  ProofCutText,
  ProofMoreNote,
  ProofToggleLabel,
  proofExpandableProps
} from './MobileNativeChatProofOverflow'
import { proofKeyed } from './MobileNativeChatProofParts'

const KIND_LABELS: Record<NativeChatProofKind, string> = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
  desktop: 'Desktop',
  figma: 'Figma',
  code: 'Code'
}

// Chosen at render, not from module tables, so a test's partial icon mock still loads the card.
function KindIcon({ kind }: { kind: NativeChatProofKind }): React.JSX.Element {
  const props = { size: 12, color: colors.textSecondary }
  switch (kind) {
    case 'web':
      return <Globe {...props} />
    case 'ios':
    case 'android':
      return <Smartphone {...props} />
    case 'desktop':
      return <Monitor {...props} />
    case 'figma':
      return <PenTool {...props} />
    case 'code':
      return <CodeXml {...props} />
  }
}

function CheckIcon({ tone }: { tone: NativeChatProofCheck['tone'] }): React.JSX.Element {
  const props = { size: 14, color: CHECK_COLORS[tone] }
  switch (tone) {
    case 'pass':
      return <CircleCheck {...props} />
    case 'fail':
      return <CircleX {...props} />
    case 'unchecked':
      return <CircleDashed {...props} />
    case 'neutral':
      return <Circle {...props} size={8} />
  }
}

const CHECK_COLORS: Record<NativeChatProofCheck['tone'], string> = {
  pass: colors.statusGreen,
  fail: colors.statusAmber,
  unchecked: colors.textMuted,
  neutral: colors.textMuted
}

function KindBadge({ kind }: { kind: NativeChatProofKind }): React.JSX.Element {
  return (
    <View style={styles.kind}>
      <KindIcon kind={kind} />
      <Text style={styles.kindText}>{KIND_LABELS[kind]}</Text>
    </View>
  )
}

/** Passing results read as normal text; a failure is warned, anything unchecked greyed.
 *  A row the card cut to fit shows its full text on a tap. */
function ProofCheckRow({ check }: { check: NativeChatProofCheck }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const unchecked = check.tone === 'unchecked'
  const label = expanded ? (check.full?.label ?? check.label) : check.label
  const result = expanded ? (check.full?.result ?? check.result) : check.result
  const expandable = check.full ? proofExpandableProps(expanded, () => setExpanded((o) => !o)) : {}
  return (
    <View style={styles.check}>
      <View style={styles.checkIcon}>
        <CheckIcon tone={check.tone} />
      </View>
      <Text style={[styles.checkText, unchecked ? styles.muted : null]} {...expandable}>
        <Text style={unchecked ? null : styles.muted}>{label}</Text>
        <Text> · </Text>
        <Text
          style={[
            check.tone === 'fail' ? styles.checkFail : null,
            unchecked ? styles.italic : null
          ]}
        >
          {result}
        </Text>
        {check.full ? <ProofToggleLabel expanded={expanded} /> : null}
      </Text>
    </View>
  )
}

function ProofChecks({
  checks,
  hidden
}: {
  checks: readonly NativeChatProofCheck[]
  hidden: number
}): React.JSX.Element | null {
  if (checks.length === 0 && hidden === 0) {
    return null
  }
  return (
    <View accessibilityLabel="Checks" style={styles.checks}>
      {proofKeyed(checks, (check) => check.label).map(({ key, item: check }) => (
        <ProofCheckRow key={key} check={check} />
      ))}
      <ProofMoreNote section="checks" count={hidden} />
    </View>
  )
}

function ProofLinks({
  links,
  hidden
}: {
  links: readonly NativeChatProofLink[]
  hidden: number
}): React.JSX.Element | null {
  if (links.length === 0 && hidden === 0) {
    return null
  }
  return (
    <View style={styles.links}>
      {proofKeyed(links, (link) => link.url).map(({ key, item: link }) => (
        <Pressable
          key={key}
          accessibilityRole="link"
          accessibilityLabel={`${link.full?.label ?? link.label}, opens ${link.url}`}
          onPress={() => openExternalLink(link.url)}
          style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
        >
          <ArrowUpRight size={13} color={colors.textPrimary} />
          <Text style={styles.linkText}>{link.label}</Text>
        </Pressable>
      ))}
      <ProofMoreNote section="links" count={hidden} />
    </View>
  )
}

/**
 * A ```proof-card fence: what an agent's finished task looks like (a recording,
 * screenshots or a before/after slider) with what was and was not checked, links out and
 * reply actions. Media comes from the host's ~/.orca-personal/proof/; a file that cannot
 * be shown gets a placeholder. Text the card cut to fit opens in full on a tap, and a
 * section with items left out says how many. Bad JSON, the wrong shape or an unsafe
 * media path shows `fallback`, the raw block.
 */
export function MobileNativeChatProofCard({
  source,
  fallback
}: {
  source: string
  fallback: ReactNode
}): React.JSX.Element {
  const chat = useContext(MobileNativeChatProjectsContext)
  const messageId = useContext(MobileNativeChatMessageIdContext)
  const card = useMemo(() => parseNativeChatProofCard(source), [source])
  if (!card || !chat) {
    return <>{fallback}</>
  }
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  const hidden = card.adjustments.droppedCounts
  return (
    <View style={styles.card} accessibilityLabel={`Proof: ${card.full?.title ?? card.title}`}>
      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={[styles.meta, styles.muted, styles.chip]} numberOfLines={1}>
            <MobileNativeChatProjectChip
              href={`${NATIVE_CHAT_WORKTREE_LINK_SCHEME}${encodeURIComponent(card.worktree)}`}
              label={card.worktree}
            />
          </Text>
          {card.kind ? <KindBadge kind={card.kind} /> : null}
        </View>
        <View style={styles.titles}>
          <ProofCutText text={card.title} full={card.full?.title} style={styles.title} />
          {card.summary ? (
            <ProofCutText text={card.summary} full={card.full?.summary} style={styles.prose} />
          ) : null}
        </View>
        <MobileNativeChatProofViewer media={card.media} />
        <ProofMoreNote section="media" count={hidden.media} />
        <ProofChecks checks={card.checks} hidden={hidden.checks} />
        <ProofLinks links={card.links} hidden={hidden.links} />
        <ProofMoreNote section="actions" count={hidden.actions} />
      </View>
      <MobileNativeChatCardActions
        actions={card.actions}
        cardKey={cardKey}
        messageId={messageId}
        chat={chat}
      />
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
  body: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 10 },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  chip: { flexShrink: 1, fontWeight: '500' },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2
  },
  kindText: { color: colors.textSecondary, fontSize: 11, fontWeight: '500' },
  titles: { gap: 4 },
  title: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600',
    lineHeight: 20
  },
  prose: { color: colors.textPrimary, fontSize: typography.bodySize, lineHeight: 20 },
  meta: { fontSize: typography.metaSize },
  muted: { color: colors.textSecondary },
  italic: { fontStyle: 'italic' },
  checks: { gap: 4 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkIcon: { width: 14, height: 20, alignItems: 'center', justifyContent: 'center' },
  checkText: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: typography.metaSize,
    lineHeight: 20
  },
  checkFail: { color: colors.statusAmber, fontWeight: '500' },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.button,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  linkText: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '500' },
  pressed: { backgroundColor: colors.bgPanel }
})
