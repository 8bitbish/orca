// What a host returns to a paired client for a proof card's media, over runtime RPC
// (`nativeChat.proofMediaInfo`, `nativeChat.proofMediaRead`; thumbnails reuse
// NativeChatProofImageReply). Only files under the host's ~/.orca-personal/proof/ are read,
// gated by `native-chat.proof-media.v1`.

import type { NativeChatProofMediaType } from './native-chat-proof-card-payload'
import type {
  NativeChatProofMediaRefusal,
  NativeChatProofVideoMime
} from './native-chat-proof-media-contract'
import type { NativeChatSlackImageResult } from './native-chat-slack-image-contract'

/** Largest slice one read returns; base64 keeps the reply far under the RPC content budget. */
export const NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES = 512 * 1024
/** Largest proof file a host serves at all; recordings are meant to be under ~5 MB. */
export const NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES = 40 * 1024 * 1024
/** Images are capped lower, as on the desktop card. */
export const NATIVE_CHAT_PROOF_IMAGE_MAX_FILE_BYTES = 10 * 1024 * 1024

export type NativeChatProofMediaRpcRefusal =
  | NativeChatProofMediaRefusal
  /** The file's size or modified time no longer matches the info the client is reading against. */
  | 'changed'
  /** The offset lies past the end of the file. */
  | 'bad-range'

export type NativeChatProofMediaMime =
  | NativeChatSlackImageResult['mimeType']
  | NativeChatProofVideoMime

export type NativeChatProofMediaInfoRequest = { path: string }

export type NativeChatProofMediaInfoReply =
  | {
      ok: true
      type: NativeChatProofMediaType
      mimeType: NativeChatProofMediaMime
      byteLength: number
      mtimeMs: number
      /** Images only, and only when the host could decode them. */
      width?: number
      height?: number
    }
  | { ok: false; reason: NativeChatProofMediaRpcRefusal }

/** `byteLength` and `mtimeMs` echo the info reply, so a file swapped between chunks is refused. */
export type NativeChatProofMediaReadRequest = {
  path: string
  offset: number
  length: number
  byteLength: number
  mtimeMs: number
}

export type NativeChatProofMediaReadReply =
  | { ok: true; base64: string; offset: number; bytesRead: number; eof: boolean }
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

const MIMES: readonly NativeChatProofMediaMime[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm'
]

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** Unknown arms from a newer host degrade to 'unavailable' rather than failing the reply. */
function refusal(value: Record<string, unknown> | null): {
  ok: false
  reason: NativeChatProofMediaRpcRefusal
} {
  return { ok: false, reason: REFUSALS.find((known) => known === value?.reason) ?? 'unavailable' }
}

const UNAVAILABLE = { ok: false, reason: 'unavailable' } as const

export function parseNativeChatProofMediaInfoReply(value: unknown): NativeChatProofMediaInfoReply {
  const reply = record(value)
  if (reply?.ok !== true) {
    return refusal(reply)
  }
  const { type, byteLength, mtimeMs, width, height } = reply
  const mimeType = MIMES.find((known) => known === reply.mimeType)
  if (
    (type !== 'image' && type !== 'video') ||
    mimeType === undefined ||
    !mimeType.startsWith(`${type}/`) ||
    !count(byteLength) ||
    typeof mtimeMs !== 'number' ||
    !Number.isFinite(mtimeMs)
  ) {
    return UNAVAILABLE
  }
  const size = count(width) && count(height) && width > 0 && height > 0 ? { width, height } : {}
  return { ok: true, type, mimeType, byteLength, mtimeMs, ...size }
}

export function parseNativeChatProofMediaReadReply(value: unknown): NativeChatProofMediaReadReply {
  const reply = record(value)
  if (reply?.ok !== true) {
    return refusal(reply)
  }
  const { base64, offset, bytesRead, eof } = reply
  if (
    typeof base64 !== 'string' ||
    base64.length % 4 !== 0 ||
    !BASE64.test(base64) ||
    !count(offset) ||
    !count(bytesRead) ||
    typeof eof !== 'boolean'
  ) {
    return UNAVAILABLE
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  // A slice that does not decode to the length it claims is torn; the client must not stitch it in.
  return (base64.length / 4) * 3 - padding === bytesRead
    ? { ok: true, base64, offset, bytesRead, eof }
    : UNAVAILABLE
}
