import { NATIVE_CHAT_PROOF_MEDIA_MOBILE_METHODS } from '../../../shared/native-chat-proof-media-capability'
import { MOBILE_RPC_METHOD_ALLOWLIST } from './runtime-rpc-mobile-method-allowlist'
import { TERMINAL_MESSAGE_QUEUE_MOBILE_METHODS } from './runtime-rpc-mobile-terminal-message-queue-methods'

// Personal-build mobile methods, kept out of upstream's allowlist so that file merges untouched.
export const PERSONAL_MOBILE_RPC_METHODS: ReadonlySet<string> = new Set([
  'nativeChat.slackImage',
  ...NATIVE_CHAT_PROOF_MEDIA_MOBILE_METHODS,
  ...TERMINAL_MESSAGE_QUEUE_MOBILE_METHODS
])

export function isMobileRpcMethodAllowed(method: string): boolean {
  return MOBILE_RPC_METHOD_ALLOWLIST.has(method) || PERSONAL_MOBILE_RPC_METHODS.has(method)
}
