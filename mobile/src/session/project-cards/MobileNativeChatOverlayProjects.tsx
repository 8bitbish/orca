import type { ComponentType } from 'react'
import type { ConnectionState } from '../../transport/connection/connection-state'
import type { MobileNativeChatController } from '../native-chat/mobile-native-chat-controller-contract'
import type { MobileNativeChatInputLockReason } from '../native-chat/MobileNativeChatView'
import type { MobileNativeChatImageSource } from '../native-chat/visual/mobile-native-chat-image-preview'
import { MobileNativeChatProjectsProvider } from './MobileNativeChatProjectsProvider'

type OverlayProps = {
  controller: Pick<MobileNativeChatController, 'nativeChatSession' | 'handleNativeChatSend'>
  /** Chips and cards read the host through its client and `hostId`; without one they show what
   *  the reply carries. */
  imageSource?: MobileNativeChatImageSource
  connState: ConnectionState
  inputLockReason: MobileNativeChatInputLockReason | null
}

/** Puts the chat overlay, its sheets included, inside the project chips' and cards' host context. */
export function withMobileNativeChatProjects<P extends OverlayProps>(
  Overlay: ComponentType<P>
): ComponentType<P> {
  return function MobileNativeChatOverlayProjects(props: P) {
    return (
      <MobileNativeChatProjectsProvider
        client={props.imageSource?.client ?? null}
        hostId={props.imageSource?.hostId ?? ''}
        connState={props.connState}
        messages={props.controller.nativeChatSession.messages}
        send={props.controller.handleNativeChatSend}
        canSend={props.inputLockReason === null}
      >
        <Overlay {...props} />
      </MobileNativeChatProjectsProvider>
    )
  }
}
