import {
  parseNativeChatProofImageReply,
  type NativeChatProofImageReply
} from '../../../../src/shared/native-chat-proof-media-contract'
import {
  parseNativeChatProofMediaInfoReply,
  parseNativeChatProofMediaReadReply,
  type NativeChatProofMediaInfoReply,
  type NativeChatProofMediaReadReply,
  type NativeChatProofMediaReadRequest
} from '../../../../src/shared/native-chat-proof-media-rpc-contract'
import { bindDeferredRpcOperation, defineRpcOperation } from '../../transport/rpc-operation'
import type { RpcCompatibleReader } from '../../transport/rpc-operation-contract'

/** The three host calls a proof card's media needs. Every one resolves; none throws. */
export type MobileNativeChatProofMediaHost = {
  info: (path: string) => Promise<NativeChatProofMediaInfoReply>
  read: (request: NativeChatProofMediaReadRequest) => Promise<NativeChatProofMediaReadReply>
  thumbnail: (path: string) => Promise<NativeChatProofImageReply>
}

// The shared parsers already fold any off-shape reply into a typed refusal.
function alwaysCompatible<Variant extends string, Value>(
  variant: Variant,
  parse: (raw: unknown) => Value
): RpcCompatibleReader<unknown, Variant, Value> {
  return (raw) => ({
    compatible: true,
    variant,
    value: parse(raw),
    salvage: { droppedPaths: [], droppedCount: 0 }
  })
}

const proofMediaInfo = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'nativeChat.proof-media-info-or-null',
    method: 'nativeChat.proofMediaInfo',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: alwaysCompatible('proof-media-info', parseNativeChatProofMediaInfoReply)
  })
)

const proofMediaRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'nativeChat.proof-media-read-or-null',
    method: 'nativeChat.proofMediaRead',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: alwaysCompatible('proof-media-read', parseNativeChatProofMediaReadReply)
  })
)

const proofMediaThumbnail = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'nativeChat.proof-media-thumbnail-or-null',
    method: 'nativeChat.proofMediaThumbnail',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: alwaysCompatible('proof-media-thumbnail', parseNativeChatProofImageReply)
  })
)

const TIMEOUT_MS = 30_000
const UNAVAILABLE = { ok: false, reason: 'unavailable' } as const

type ProofMediaClient = Parameters<typeof proofMediaInfo.request>[0]

/** An old host (method_not_found), a forbidden call, a bad reply or a lost connection all
 *  read as 'unavailable'. */
export function createMobileNativeChatProofMediaHost(
  client: ProofMediaClient
): MobileNativeChatProofMediaHost {
  const options = { timeoutMs: TIMEOUT_MS, failWhenDisconnected: true }
  return {
    info: async (path) => {
      try {
        return (
          proofMediaInfo.interpret(await proofMediaInfo.request(client, { path }, options)) ??
          UNAVAILABLE
        )
      } catch {
        return UNAVAILABLE
      }
    },
    read: async (request) => {
      try {
        return (
          proofMediaRead.interpret(await proofMediaRead.request(client, request, options)) ??
          UNAVAILABLE
        )
      } catch {
        return UNAVAILABLE
      }
    },
    thumbnail: async (path) => {
      try {
        return (
          proofMediaThumbnail.interpret(
            await proofMediaThumbnail.request(client, { path }, options)
          ) ?? UNAVAILABLE
        )
      } catch {
        return UNAVAILABLE
      }
    }
  }
}
