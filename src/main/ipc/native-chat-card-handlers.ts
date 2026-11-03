import { registerNativeChatHandlers } from './native-chat'
import { registerNativeChatSlackHandlers } from './native-chat-slack'
import { registerNativeChatLinkPreviewHandlers } from './native-chat-link-preview'
import { registerNativeChatProofHandlers } from './native-chat-proof'

/** Chat IPC plus what chat cards need: Slack names, link previews and proof media. Registered in
 *  place of the plain chat handlers so the core registrar stays within its line budget. */
export function registerNativeChatWithCardHandlers(): void {
  registerNativeChatHandlers()
  registerNativeChatSlackHandlers()
  registerNativeChatLinkPreviewHandlers()
  registerNativeChatProofHandlers()
}
