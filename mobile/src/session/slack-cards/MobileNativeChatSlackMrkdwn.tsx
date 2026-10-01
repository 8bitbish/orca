import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  parseSlackMrkdwn,
  type SlackMrkdwnNode
} from '../../../../src/shared/native-chat-slack-mrkdwn'
import { openExternalLink } from '../../platform/external-link'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import { MobileNativeChatSlackTargetChip } from './MobileNativeChatSlackChip'

type Workspace = { teamId: string; domain?: string }

const COLLAPSED_LINES = 3
// Above this the collapsed text is assumed to run past three lines.
const COLLAPSE_CHARS = 150

function plainLength(nodes: readonly SlackMrkdwnNode[]): number {
  let length = 0
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'code' || node.type === 'pre') {
      length += node.text.length
    } else if (node.type === 'link') {
      length += node.label.length
    } else if (node.type === 'bold' || node.type === 'italic' || node.type === 'strike') {
      length += plainLength(node.children)
    } else {
      length += 8
    }
  }
  return length
}

function renderNode(node: SlackMrkdwnNode, key: string, workspace: Workspace): ReactNode {
  const domain = workspace.domain === undefined ? {} : { domain: workspace.domain }
  switch (node.type) {
    case 'text':
      return node.text
    case 'break':
      return '\n'
    case 'bold':
    case 'italic':
    case 'strike':
      return (
        <Text key={key} style={styles[node.type]}>
          {node.children.map((child, index) => renderNode(child, `${key}.${index}`, workspace))}
        </Text>
      )
    case 'code':
      return (
        <Text key={key} style={styles.code}>
          {node.text}
        </Text>
      )
    // segments() lifts code blocks out; kept for exhaustiveness.
    case 'pre':
      return (
        <Text key={key} style={styles.code}>
          {node.text}
        </Text>
      )
    case 'link':
      return (
        <Text
          key={key}
          accessibilityRole="link"
          style={styles.link}
          onPress={() => openExternalLink(node.url)}
        >
          {node.label}
        </Text>
      )
    case 'user':
      return (
        <MobileNativeChatSlackTargetChip
          key={key}
          raised
          label={`@${node.label ?? node.userId}`}
          target={{ kind: 'user', teamId: workspace.teamId, userId: node.userId, ...domain }}
        />
      )
    case 'channel':
      return (
        <MobileNativeChatSlackTargetChip
          key={key}
          raised
          label={`#${node.label ?? node.channelId}`}
          target={{
            kind: 'channel',
            teamId: workspace.teamId,
            channelId: node.channelId,
            ...domain
          }}
        />
      )
  }
}

type Segment = { kind: 'inline'; nodes: SlackMrkdwnNode[] } | { kind: 'pre'; text: string }

function segments(nodes: readonly SlackMrkdwnNode[]): Segment[] {
  const out: Segment[] = []
  for (const node of nodes) {
    if (node.type === 'pre') {
      out.push({ kind: 'pre', text: node.text })
      continue
    }
    const last = out.at(-1)
    if (last?.kind === 'inline') {
      last.nodes.push(node)
    } else {
      out.push({ kind: 'inline', nodes: [node] })
    }
  }
  // A code block's own line breaks are not text; drop the ones beside it.
  return out
    .map((segment) =>
      segment.kind === 'pre'
        ? segment
        : { kind: 'inline' as const, nodes: trimBreaks(segment.nodes) }
    )
    .filter((segment) => segment.kind === 'pre' || segment.nodes.length > 0)
}

function trimBreaks(nodes: SlackMrkdwnNode[]): SlackMrkdwnNode[] {
  let start = 0
  let end = nodes.length
  while (start < end && nodes[start]!.type === 'break') {
    start += 1
  }
  while (end > start && nodes[end - 1]!.type === 'break') {
    end -= 1
  }
  return nodes.slice(start, end)
}

/**
 * A Slack message's original mrkdwn drawn from the shared parse tree (not via the
 * markdown renderer, so nothing in the text can become markup). Mentions are chips.
 * With `collapsible`, long text clamps to three lines behind more / less.
 */
export function MobileNativeChatSlackMrkdwn({
  source,
  workspace,
  collapsible = false
}: {
  source: string
  workspace: Workspace
  collapsible?: boolean
}): React.JSX.Element {
  const nodes = useMemo(() => parseSlackMrkdwn(source), [source])
  const parts = useMemo(() => segments(nodes), [nodes])
  const breaks = nodes.filter((node) => node.type === 'break').length
  const long = parts.length > 1 || breaks >= COLLAPSED_LINES || plainLength(nodes) > COLLAPSE_CHARS
  const [expanded, setExpanded] = useState(false)
  const clamped = collapsible && long && !expanded
  const shown = clamped ? parts.slice(0, 1) : parts
  return (
    <View style={styles.root}>
      {shown.map((segment, index) =>
        segment.kind === 'pre' ? (
          <View key={index} style={styles.pre}>
            <Text
              selectable
              style={styles.code}
              numberOfLines={clamped ? COLLAPSED_LINES : undefined}
            >
              {segment.text}
            </Text>
          </View>
        ) : (
          // Not selectable: Android's selectable text swallows the chips' taps.
          <Text
            key={index}
            style={styles.prose}
            numberOfLines={clamped ? COLLAPSED_LINES : undefined}
          >
            {segment.nodes.map((node, nodeIndex) =>
              renderNode(node, `${index}.${nodeIndex}`, workspace)
            )}
          </Text>
        )
      )}
      {collapsible && long ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less of the message' : 'Show the whole message'}
          hitSlop={8}
          onPress={() => setExpanded((value) => !value)}
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>{expanded ? 'less ▴' : 'more ▾'}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  prose: { color: colors.textPrimary, fontSize: typography.bodySize, lineHeight: 20 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  code: {
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize,
    color: colors.textPrimary,
    backgroundColor: colors.bgPanel
  },
  pre: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.row,
    padding: spacing.sm
  },
  link: { color: colors.accentBlue, textDecorationLine: 'underline' },
  toggle: { alignSelf: 'flex-start' },
  toggleText: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '500' }
})
