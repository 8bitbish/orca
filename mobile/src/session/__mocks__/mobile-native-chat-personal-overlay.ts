import type { ConnectionState } from '../../transport/connection/connection-state'

// The overlay's personal-build props, for the prompt-controller harness.
export function personalOverlayProps(
  connState: ConnectionState,
  sendNativeChat: (text: string) => Promise<boolean>
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
