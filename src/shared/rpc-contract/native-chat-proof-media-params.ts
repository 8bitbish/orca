import { z } from 'zod'
import {
  NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES,
  NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES
} from '../native-chat-proof-media-rpc-contract'
import { NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_COORDINATE } from '../native-chat-proof-image-region-contract'

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

const RegionCoordinate = z.number().int().min(0).max(NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_COORDINATE)
const RegionSize = z.number().int().min(1).max(NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_COORDINATE)

// Why: the host clamps the rectangle to the image and maxWidth to its own cap, so a client
// asking for more than an older host serves still gets an answer, just a smaller one.
export const NativeChatProofImageRegion = z.object({
  path: ProofMediaPath,
  x: RegionCoordinate,
  y: RegionCoordinate,
  width: RegionSize,
  height: RegionSize,
  maxWidth: RegionSize
})
