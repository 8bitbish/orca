import type { ConnectionState } from '../../transport/types'
import type { MobileNativeChatController } from '../use-mobile-native-chat-controller'

// The overlay's personal-build props, for the prompt-controller harness.
export function personalOverlayProps(
  connState: ConnectionState,
  sendNativeChat: MobileNativeChatController['handleNativeChatSend']
) {
  return {
    client: null,
    hostId: 'host-1',
    connState,
    images: {
      sendNativeChat,
      attachments: [],
      isAttaching: false,
      attachImage: async () => {},
      removeAttachment: () => {},
      restoreImages: () => {}
    }
  }
}
