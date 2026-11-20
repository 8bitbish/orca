import { memo, useMemo, type ComponentType } from 'react'
import type { NativeChatMessage } from '../../../../src/shared/native-chat/native-chat-types'
import { withoutNativeChatCardPressTag } from '../../../../src/shared/native-chat-card-press'
import { MobileNativeChatMessageIdContext } from './mobile-native-chat-project-context'

/** Memoizes a transcript row, tells the cards inside it which message they belong to, and hides
 *  a card press's tag line from the sent message. */
export function withMobileNativeChatCardRowScope<P extends { message: NativeChatMessage }>(
  Row: ComponentType<P>
): ComponentType<P> {
  return memo(function MobileNativeChatCardRowScope(props: P) {
    const { message } = props
    const shown = useMemo(() => {
      const blocks =
        message.role === 'user' ? withoutNativeChatCardPressTag(message.blocks) : message.blocks
      return blocks === message.blocks ? message : { ...message, blocks }
    }, [message])
    return (
      <MobileNativeChatMessageIdContext.Provider value={message.id}>
        <Row {...props} message={shown} />
      </MobileNativeChatMessageIdContext.Provider>
    )
  })
}
