import {
  EMPTY_NATIVE_CHAT_SLACK_NAMES,
  parseNativeChatSlackNamesResult,
  type NativeChatSlackNamesRequest,
  type NativeChatSlackNamesResult
} from '../../../../src/shared/native-chat-slack-names-contract'
import { bindDeferredRpcOperation, defineRpcOperation } from '../../transport/rpc-operation'
import type { RpcCompatibleReader } from '../../transport/rpc-operation-contract'

const readSlackNames: RpcCompatibleReader<unknown, 'slack-names', NativeChatSlackNamesResult> = (
  raw
) => {
  const value = parseNativeChatSlackNamesResult(raw)
  return value
    ? {
        compatible: true,
        variant: 'slack-names',
        value,
        salvage: { droppedPaths: [], droppedCount: 0 }
      }
    : { compatible: false, issues: [{ path: '', message: 'not a Slack names reply' }] }
}

/** Names for mention ids from the chat host's slack-mcp cache. */
export const nativeChatSlackNamesRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'nativeChat.slack-names-or-null',
    method: 'nativeChat.slackNames',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: readSlackNames
  })
)

const TIMEOUT_MS = 10_000

/** Never throws: an old host (method_not_found), a bad reply or a lost connection
 *  all read as no names, so mentions show their ids. */
export async function fetchMobileNativeChatSlackNames(
  client: Parameters<typeof nativeChatSlackNamesRead.request>[0],
  request: NativeChatSlackNamesRequest
): Promise<NativeChatSlackNamesResult> {
  try {
    const reply = await nativeChatSlackNamesRead.request(client, request, {
      timeoutMs: TIMEOUT_MS,
      failWhenDisconnected: true
    })
    return nativeChatSlackNamesRead.interpret(reply) ?? EMPTY_NATIVE_CHAT_SLACK_NAMES
  } catch {
    return EMPTY_NATIVE_CHAT_SLACK_NAMES
  }
}
