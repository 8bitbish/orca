import { ChevronRight } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatNativeChatDuration } from '../../../src/shared/native-chat-turn-status'
import { MobileMarkdown } from '../components/MobileMarkdown'
import { colors, spacing } from '../theme/mobile-theme'
import { TEXT_SIZE } from './mobile-native-chat-message-styles'

export type MobileNativeChatThought = {
  /** Whole seconds the thought took, when the host's stamps can say. */
  seconds: number | null
  /** Still the newest thing its working turn produced. */
  live: boolean
  open: boolean
  onToggle: () => void
}

/** The label a reasoning row folds to, as desktop words it. */
export function mobileNativeChatThoughtLabel(live: boolean, seconds: number | null): string {
  if (live) {
    return 'Thinking…'
  }
  return seconds === null ? 'Thought' : `Thought for ${formatNativeChatDuration(seconds)}`
}

/**
 * The model's reasoning as one line that opens to the full text. A thought with no
 * text (the provider recorded that it thought, not what) is the same line with
 * nothing to open.
 */
export function MobileNativeChatThoughtRow({
  markdown,
  thought,
  fontScale,
  onOpenFile
}: {
  markdown: string
  thought: MobileNativeChatThought
  fontScale: number
  onOpenFile?: (relativePath: string) => void
}): React.JSX.Element {
  const label = mobileNativeChatThoughtLabel(thought.live, thought.seconds)
  const labelStyle = [
    styles.label,
    { fontSize: TEXT_SIZE * fontScale },
    thought.live ? styles.live : null
  ]
  if (!markdown.trim()) {
    return (
      <View style={styles.line}>
        <Text style={labelStyle} numberOfLines={1}>
          {label}
        </Text>
      </View>
    )
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: thought.open }}
        onPress={thought.onToggle}
        style={styles.line}
      >
        <Text style={labelStyle} numberOfLines={1}>
          {label}
        </Text>
        <ChevronRight
          size={14}
          color={colors.textMuted}
          style={thought.open ? styles.chevronOpen : undefined}
        />
      </Pressable>
      {thought.open ? (
        <View style={styles.body}>
          <MobileMarkdown content={markdown} textScale={fontScale} onOpenFile={onOpenFile} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  label: { color: colors.textSecondary },
  live: { color: colors.textPrimary },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  body: {
    marginTop: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderSubtle,
    paddingLeft: spacing.md,
    opacity: 0.8
  }
})
