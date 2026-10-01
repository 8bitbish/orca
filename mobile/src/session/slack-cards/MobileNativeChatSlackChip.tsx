import { StyleSheet, Text } from 'react-native'
import {
  parseNativeChatSlackHref,
  type NativeChatSlackTarget
} from '../../../../src/shared/native-chat-slack-href'
import { colors } from '../../theme/mobile-theme'
import { openMobileNativeChatSlackTarget } from './mobile-native-chat-slack-open'

const KIND_LABEL: Record<NativeChatSlackTarget['kind'], string> = {
  user: 'Slack person',
  channel: 'Slack channel',
  message: 'Slack message'
}

/**
 * An inline pill for a Slack person, channel or message that opens it in Slack.
 * `raised` is for a chip on a card, whose surface is already the raised tone.
 */
export function MobileNativeChatSlackTargetChip({
  target,
  label,
  raised = false
}: {
  target: NativeChatSlackTarget
  label: string
  raised?: boolean
}): React.JSX.Element {
  const message = target.kind === 'message'
  const text = message && !label.trimEnd().endsWith('↗') ? `${label} ↗` : label
  // Non-breaking padding, so a wrap never strands an empty pill at a line's end.
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={`${KIND_LABEL[target.kind]} ${label}, opens in Slack`}
      suppressHighlighting
      onPress={() => void openMobileNativeChatSlackTarget(target)}
      style={[styles.chip, raised ? styles.chipRaised : null, message ? styles.message : null]}
    >
      {`\u00a0${text}\u00a0`}
    </Text>
  )
}

/** A `slack-user:` / `slack-channel:` / `slack-message:` link in a reply; off-grammar
 *  links read as their plain text. */
export function MobileNativeChatSlackChip({
  href,
  label
}: {
  href: string
  label: string
}): React.JSX.Element {
  const target = parseNativeChatSlackHref(href)
  return target ? (
    <MobileNativeChatSlackTargetChip target={target} label={label} />
  ) : (
    <Text>{label}</Text>
  )
}

const styles = StyleSheet.create({
  chip: { backgroundColor: colors.bgRaised, color: colors.textPrimary, fontWeight: '600' },
  chipRaised: { backgroundColor: colors.bgPanel },
  message: { color: colors.accentBlue, fontWeight: '500' }
})
