import { useContext } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { colors, typography } from '../theme/mobile-theme'
import { styles as markdownStyles } from './mobile-markdown-styles'
import {
  MarkdownProseSizeContext,
  MarkdownSelectableContext,
  MarkdownText
} from './mobile-markdown-text'

// Longer spans stay text so they can wrap; a view cannot break across lines.
const MAX_BOXED_LENGTH = 40

/**
 * A `code` span. Where text is not selectable (the Android transcript) a short span is a
 * small rounded box, because Android draws a nested Text's background as a flat highlight
 * with no rounding or padding. Elsewhere it stays selectable text.
 */
export function MobileInlineCode({
  code,
  onPress
}: {
  code: string
  /** Set for a file path, which opens the file. */
  onPress?: () => void
}): React.JSX.Element {
  const selectable = useContext(MarkdownSelectableContext)
  const proseSize = useContext(MarkdownProseSizeContext)
  if (selectable || code.length > MAX_BOXED_LENGTH || code.includes('\n')) {
    return (
      <MarkdownText
        style={[markdownStyles.inlineCode, onPress ? markdownStyles.inlineCodeLink : null]}
        onPress={onPress}
      >
        {code}
      </MarkdownText>
    )
  }
  const fontSize = Math.round(proseSize * 0.82)
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'link' : undefined}
      style={[styles.box, { transform: [{ translateY: Math.round(fontSize * 0.24) }] }]}
    >
      <Text
        numberOfLines={1}
        style={[styles.code, { fontSize, lineHeight: fontSize + 5 }, onPress ? styles.link : null]}
      >
        {code}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  box: {
    paddingHorizontal: 5,
    marginHorizontal: 1,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgRaised
  },
  code: { fontFamily: typography.monoFamily, color: colors.textPrimary },
  link: { color: colors.accentBlue }
})
