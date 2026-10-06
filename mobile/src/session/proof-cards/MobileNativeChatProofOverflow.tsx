import { useState } from 'react'
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native'
import type { NativeChatProofSection } from '../../../../src/shared/native-chat-proof-card-payload'
import { colors } from '../../theme/mobile-theme'

const SECTION_NOUNS: Record<NativeChatProofSection, string> = {
  media: 'media',
  checks: 'checks',
  links: 'links',
  actions: 'replies'
}

/** The "Show more" / "Show less" tail of text the card cut to fit. */
export function ProofToggleLabel({ expanded }: { expanded: boolean }): React.JSX.Element {
  return <Text style={styles.toggle}>{expanded ? ' Show less' : ' Show more'}</Text>
}

/** What a cut text field needs to toggle on tap, for screen readers too. */
export function proofExpandableProps(expanded: boolean, toggle: () => void) {
  return {
    accessibilityRole: 'button',
    accessibilityState: { expanded },
    accessibilityHint: expanded ? 'Shows the shortened text' : 'Shows the full text',
    onPress: toggle
  } as const
}

/** Text the card cut to fit: a tap swaps in the full text, and back. */
export function ProofCutText({
  text,
  full,
  style
}: {
  text: string
  full?: string
  style?: StyleProp<TextStyle>
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  if (full === undefined) {
    return <Text style={style}>{text}</Text>
  }
  return (
    <Text style={style} {...proofExpandableProps(expanded, () => setExpanded((open) => !open))}>
      {expanded ? full : text}
      <ProofToggleLabel expanded={expanded} />
    </Text>
  )
}

/** Items the card left out of a section: past its maximum, or invalid on their own. */
export function ProofMoreNote({
  section,
  count
}: {
  section: NativeChatProofSection
  count: number
}): React.JSX.Element | null {
  if (count === 0) {
    return null
  }
  return (
    <Text
      style={styles.more}
      accessibilityLabel={`${count} more ${SECTION_NOUNS[section]} not shown`}
    >
      {`+${count} more`}
    </Text>
  )
}

const styles = StyleSheet.create({
  toggle: { color: colors.accentBlue, fontWeight: '500' },
  more: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 }
})
