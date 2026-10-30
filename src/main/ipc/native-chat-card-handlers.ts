import { registerNativeChatSlackHandlers } from './native-chat-slack'
import { registerNativeChatLinkPreviewHandlers } from './native-chat-link-preview'
import { registerNativeChatProofHandlers } from './native-chat-proof'

/** IPC behind chat cards: Slack names, link previews and proof media. */
export function registerNativeChatCardHandlers(): void {
  registerNativeChatSlackHandlers()
  registerNativeChatLinkPreviewHandlers()
  registerNativeChatProofHandlers()
}
