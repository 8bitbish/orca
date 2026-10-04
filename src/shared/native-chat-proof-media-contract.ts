// What the desktop host returns for a proof card's media, over IPC
// (`nativeChat:proofImage`, `nativeChat:proofVideo`). Only files under
// ~/.orca-personal/proof/ are ever read.

import {
  parseNativeChatSlackImageResult,
  type NativeChatSlackImageResult,
  type NativeChatSlackImageVariant
} from './native-chat-slack-image-contract'

export type NativeChatProofMediaRefusal =
  | 'invalid-path'
  | 'folder-missing'
  | 'outside-folder'
  | 'wrong-type'
  | 'missing'
  | 'too-large'
  | 'unavailable'

export type NativeChatProofImageRequest = {
  path: string
  variant: NativeChatSlackImageVariant
}

export type NativeChatProofVideoRequest = { path: string }

export type NativeChatProofVideoMime = 'video/mp4' | 'video/quicktime' | 'video/webm'

export type NativeChatProofImageReply =
  | { ok: true; image: NativeChatSlackImageResult }
  | { ok: false; reason: NativeChatProofMediaRefusal }

export type NativeChatProofVideoReply =
  | { ok: true; mimeType: NativeChatProofVideoMime; bytes: Uint8Array }
  | { ok: false; reason: NativeChatProofMediaRefusal }

const REFUSALS: readonly NativeChatProofMediaRefusal[] = [
  'invalid-path',
  'folder-missing',
  'outside-folder',
  'wrong-type',
  'missing',
  'too-large',
  'unavailable'
]

function refusal(value: unknown): {
  ok: false
  reason: NativeChatProofMediaRefusal
} {
  const reason =
    typeof value === 'object' && value !== null && 'reason' in value ? value.reason : undefined
  return {
    ok: false,
    reason: REFUSALS.find((known) => known === reason) ?? 'unavailable'
  }
}

function isOk(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === true
}

/** A host reply, kept only in the documented shape; anything else reads as unavailable. */
export function parseNativeChatProofImageReply(value: unknown): NativeChatProofImageReply {
  if (!isOk(value)) {
    return refusal(value)
  }
  const image = parseNativeChatSlackImageResult(value.image)
  return image ? { ok: true, image } : { ok: false, reason: 'unavailable' }
}

export function parseNativeChatProofVideoReply(value: unknown): NativeChatProofVideoReply {
  if (!isOk(value)) {
    return refusal(value)
  }
  const { mimeType, bytes } = value
  if (
    (mimeType !== 'video/mp4' && mimeType !== 'video/quicktime' && mimeType !== 'video/webm') ||
    !(bytes instanceof Uint8Array)
  ) {
    return { ok: false, reason: 'unavailable' }
  }
  return { ok: true, mimeType, bytes }
}
