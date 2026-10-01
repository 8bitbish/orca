import { useContext, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/mobile-theme'
import { MarkdownProseSizeContext } from './mobile-markdown-text'

function pillFontSize(proseSize: number): number {
  return Math.round(proseSize * 0.82)
}

/** A leading icon's size: the pill's text line, so a round icon fills the pill's rounded end. */
export function mobileInlinePillIconSize(proseSize: number): number {
  return pillFontSize(proseSize) + 6
}

/**
 * A rounded pill that sits inline in prose, as desktop's project and Slack chips do. A View,
 * not a styled run of text: Android draws a nested Text's background as a flat highlight,
 * with no rounding or padding.
 */
export function MobileInlinePill({
  label,
  detail,
  leading,
  dotColor,
  tone = 'default',
  raised = false,
  accessibilityLabel,
  onPress
}: {
  label: string
  /** A quieter second part, such as a workspace name. */
  detail?: string | null
  leading?: ReactNode
  /** A status dot after the label. */
  dotColor?: string
  tone?: 'default' | 'link'
  /** On a card, whose surface is already the raised tone. */
  raised?: boolean
  accessibilityLabel: string
  onPress?: () => void
}): React.JSX.Element {
  const proseSize = useContext(MarkdownProseSizeContext)
  const fontSize = pillFontSize(proseSize)
  const lineHeight = mobileInlinePillIconSize(proseSize)
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.pill,
        // A leading icon sits in the pill's rounded end, so that side needs no inset of its own.
        { paddingLeft: leading ? 2 : 9, paddingRight: dotColor ? 7 : 9 },
        raised ? styles.raised : null,
        pressed ? styles.pressed : null,
        // Lifts the pill onto the prose's text line; Android seats inline views on the baseline.
        { transform: [{ translateY: Math.round(fontSize * 0.28) }] }
      ]}
    >
      {leading}
      <Text
        numberOfLines={1}
        style={[styles.label, { fontSize, lineHeight }, tone === 'link' ? styles.link : null]}
      >
        {label}
      </Text>
      {detail ? (
        <Text numberOfLines={1} style={[styles.detail, { fontSize, lineHeight }]}>
          {detail}
        </Text>
      ) : null}
      {dotColor ? (
        <View
          style={[
            styles.dot,
            {
              width: fontSize * 0.5,
              height: fontSize * 0.5,
              borderRadius: fontSize * 0.25,
              backgroundColor: dotColor
            }
          ]}
        />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 260,
    paddingVertical: 1,
    marginHorizontal: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgRaised
  },
  raised: { backgroundColor: colors.bgPanel },
  pressed: { opacity: 0.7 },
  label: { flexShrink: 1, color: colors.textPrimary, fontWeight: '500' },
  link: { color: colors.accentBlue, fontWeight: '500' },
  detail: { flexShrink: 1, color: colors.textSecondary },
  dot: { marginLeft: 1 }
})
