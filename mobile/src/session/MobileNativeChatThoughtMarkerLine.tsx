import { Brain } from 'lucide-react-native'
import { Text, View } from 'react-native'
import type { NativeChatMessage } from '../../../src/shared/native-chat/native-chat-types'
import { colors } from '../theme/mobile-theme'
import { styles } from './native-chat/transcript/mobile-native-chat-message-styles'
import { mobileNativeChatThoughtMarkerLabel } from './mobile-native-chat-thought-rows'
import { isNativeChatThoughtMarker } from '../../../src/shared/native-chat-thought-marker'

/** A thought with no text: one line in the reasoning row's look, with nothing to open. */
export function MobileNativeChatThoughtMarkerLine({
  message,
  live
}: {
  message: Pick<NativeChatMessage, 'state' | 'completedAt' | 'timestamp'>
  live: boolean
}): React.JSX.Element {
  return (
    <View style={styles.reasoningToggle}>
      <Brain size={15} color={colors.textMuted} strokeWidth={2} />
      <Text style={styles.reasoningHeadline} numberOfLines={1}>
        {mobileNativeChatThoughtMarkerLabel(message, live)}
      </Text>
    </View>
  )
}

/** The transcript row for an empty-text thought; nothing when the message is not one. */
export function MobileNativeChatThoughtMarkerRow({
  message,
  working
}: {
  message: NativeChatMessage
  /** The live turn's working flag; only an explicit false settles the label. */
  working: boolean | undefined
}): React.JSX.Element | null {
  return isNativeChatThoughtMarker(message) ? (
    <View style={styles.row}>
      <MobileNativeChatThoughtMarkerLine message={message} live={working !== false} />
    </View>
  ) : null
}
