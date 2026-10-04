import { z } from 'zod'
import {
  NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES,
  NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES
} from '../native-chat-proof-media-rpc-contract'

// Why: the path is only a request; the host resolves it inside ~/.orca-personal/proof/
// and refuses anything else, so the schema bounds its size, not its content.
const ProofMediaPath = z.string().min(1).max(1024)

export const NativeChatProofMediaInfo = z.object({ path: ProofMediaPath })

export const NativeChatProofMediaRead = z.object({
  path: ProofMediaPath,
  offset: z.number().int().min(0).max(NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES),
  length: z.number().int().min(1).max(NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES),
  byteLength: z.number().int().min(1).max(NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES),
  mtimeMs: z.number().finite().min(0)
})

export const NativeChatProofMediaThumbnail = z.object({ path: ProofMediaPath })
