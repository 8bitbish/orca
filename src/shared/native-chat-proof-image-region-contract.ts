// What a host returns for one rectangle of a large proof image (`nativeChat.proofImageRegion`),
// so a zoomed viewer can show source pixels without fetching the whole file. Gated by
// `native-chat.proof-image-region.v1`; only files under the host's ~/.orca-personal/proof/.

import type { NativeChatProofMediaRpcRefusal } from './native-chat-proof-media-rpc-contract'

/** Widest region a host returns; a larger request is scaled down to this. */
export const NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_WIDTH = 2048
/** Most pixels a region reply carries, so a tall strip cannot dodge the width cap. */
export const NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_PIXELS = 2048 * 2048
/** Largest encoded region; the base64 reply stays far under the RPC content budget. */
export const NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_BYTES = 1024 * 1024
/** Largest coordinate or size a request may name; bigger than any decodable image. */
export const NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_COORDINATE = 1 << 20

/** The rectangle is in source-image pixels. */
export type NativeChatProofImageRegionRequest = {
  path: string
  x: number
  y: number
  width: number
  height: number
  maxWidth: number
}

/** `x`…`height` echo the rectangle actually served, after clamping to the image. */
export type NativeChatProofImageRegionReply =
  | {
      ok: true
      base64: string
      mimeType: 'image/jpeg'
      sourceWidth: number
      sourceHeight: number
      x: number
      y: number
      width: number
      height: number
      outputWidth: number
      outputHeight: number
    }
  | { ok: false; reason: NativeChatProofMediaRpcRefusal }

const REFUSALS: readonly NativeChatProofMediaRpcRefusal[] = [
  'invalid-path',
  'folder-missing',
  'outside-folder',
  'wrong-type',
  'missing',
  'too-large',
  'unavailable',
  'changed',
  'bad-range'
]

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function positive(value: unknown): value is number {
  return count(value) && value > 0
}

/** A host reply in the documented shape; unknown refusals and anything malformed read as unavailable. */
export function parseNativeChatProofImageRegionReply(
  value: unknown
): NativeChatProofImageRegionReply {
  const reply =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : null
  if (reply?.ok !== true) {
    return {
      ok: false,
      reason: REFUSALS.find((known) => known === reply?.reason) ?? 'unavailable'
    }
  }
  const { base64, sourceWidth, sourceHeight, x, y, width, height, outputWidth, outputHeight } =
    reply
  if (
    typeof base64 !== 'string' ||
    base64.length === 0 ||
    base64.length % 4 !== 0 ||
    !BASE64.test(base64) ||
    reply.mimeType !== 'image/jpeg' ||
    !positive(sourceWidth) ||
    !positive(sourceHeight) ||
    !count(x) ||
    !count(y) ||
    !positive(width) ||
    !positive(height) ||
    !positive(outputWidth) ||
    !positive(outputHeight) ||
    x + width > sourceWidth ||
    y + height > sourceHeight
  ) {
    return { ok: false, reason: 'unavailable' }
  }
  return {
    ok: true,
    base64,
    mimeType: 'image/jpeg',
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
    outputWidth,
    outputHeight
  }
}
