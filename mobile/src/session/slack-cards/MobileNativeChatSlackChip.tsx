import { Text } from 'react-native'
import { MobileInlinePill } from '../../components/MobileInlinePill'
import {
  parseNativeChatSlackHref,
  type NativeChatSlackTarget
} from '../../../../src/shared/native-chat-slack-href'
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
  raised = false,
  textSize
}: {
  target: NativeChatSlackTarget
  label: string
  raised?: boolean
  /** The size of the text the chip sits in, when that is not chat prose. */
  textSize?: number
}): React.JSX.Element {
  const message = target.kind === 'message'
  const text = message && !label.trimEnd().endsWith('↗') ? `${label} ↗` : label
  return (
    <MobileInlinePill
      label={text}
      tone={message ? 'link' : 'default'}
      raised={raised}
      proseSize={textSize}
      accessibilityLabel={`${KIND_LABEL[target.kind]} ${label}, opens in Slack`}
      onPress={() => void openMobileNativeChatSlackTarget(target)}
    />
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
