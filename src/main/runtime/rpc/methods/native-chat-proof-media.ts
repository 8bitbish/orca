import { defineMethod } from '../core'
import {
  NativeChatProofMediaInfo,
  NativeChatProofMediaRead,
  NativeChatProofMediaThumbnail
} from '../../../../shared/rpc-contract/native-chat-proof-media-params'
import { readProofImage } from '../../../native-chat/proof-media'
import {
  readProofMediaChunk,
  readProofMediaInfo
} from '../../../native-chat/proof-media-chunked-read'

// Proof card media for paired clients, from this host's ~/.orca-personal/proof/ only.
// Gated by native-chat.proof-media.v1; an old host answers method_not_found instead.
export const NATIVE_CHAT_PROOF_MEDIA_METHODS = [
  defineMethod({
    name: 'nativeChat.proofMediaInfo',
    params: NativeChatProofMediaInfo,
    handler: async (params) => readProofMediaInfo({ path: params.path })
  }),
  defineMethod({
    name: 'nativeChat.proofMediaRead',
    params: NativeChatProofMediaRead,
    handler: async (params) => readProofMediaChunk(params)
  }),
  defineMethod({
    name: 'nativeChat.proofMediaThumbnail',
    params: NativeChatProofMediaThumbnail,
    // Thumbnails are capped at 1 MB encoded, so the base64 reply fits any RPC content budget.
    handler: async (params) => readProofImage({ path: params.path, variant: 'thumbnail' })
  })
]
