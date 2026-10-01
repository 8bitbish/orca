import {
  parseNativeChatSlackImageResult,
  type NativeChatSlackImageResult,
  type NativeChatSlackImageVariant
} from '../../../../src/shared/native-chat-slack-image-contract'
import { bindDeferredRpcOperation, defineRpcOperation } from '../../transport/rpc-operation'
import type { RpcCompatibleReader } from '../../transport/rpc-operation-contract'

const readSlackImage: RpcCompatibleReader<unknown, 'slack-image', NativeChatSlackImageResult> = (
  raw
) => {
  const value = parseNativeChatSlackImageResult(raw)
  return value
    ? {
        compatible: true,
        variant: 'slack-image',
        value,
        salvage: { droppedPaths: [], droppedCount: 0 }
      }
    : { compatible: false, issues: [{ path: '', message: 'not a Slack image reply' }] }
}

/** A Slack card image from the chat host's slack-mcp cache; null for any refusal. */
export const nativeChatSlackImageRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'nativeChat.slack-image-or-null',
    method: 'nativeChat.slackImage',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: readSlackImage
  })
)

const TIMEOUT_MS = 20_000

/** Never throws: an old host (method_not_found), a refusal, a bad reply or a lost
 *  connection all read as no image. */
export async function fetchMobileNativeChatSlackImage(
  client: Parameters<typeof nativeChatSlackImageRead.request>[0],
  path: string,
  variant: NativeChatSlackImageVariant
): Promise<NativeChatSlackImageResult | null> {
  try {
    const reply = await nativeChatSlackImageRead.request(
      client,
      { path, variant },
      { timeoutMs: TIMEOUT_MS, failWhenDisconnected: true }
    )
    return nativeChatSlackImageRead.interpret(reply)
  } catch {
    return null
  }
}
