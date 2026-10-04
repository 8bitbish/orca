// Reads a proof card's media from ~/.orca-personal/proof/ on this Mac, for the
// desktop chat. That folder is the only thing it reads: a path is resolved with
// realpath and refused when it lands outside the folder, has the wrong extension,
// is too large, or does not sniff as the kind of file it claims to be.

import { open, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  hasNativeChatProofExtension,
  NATIVE_CHAT_PROOF_ROOT_HOME_RELATIVE,
  type NativeChatProofMediaType
} from '../../shared/native-chat-proof-card-payload'
import type {
  NativeChatProofImageReply,
  NativeChatProofMediaRefusal,
  NativeChatProofVideoMime,
  NativeChatProofVideoReply
} from '../../shared/native-chat-proof-media-contract'
import type { NativeChatSlackImageVariant } from '../../shared/native-chat-slack-image-contract'
import { readSlackCacheImage, type SlackCacheImageCodec } from './slack-cache-image'

export const PROOF_IMAGE_MAX_FILE_BYTES = 10 * 1024 * 1024
/** Recordings are meant to be under ~5 MB; this leaves room without letting a stray file through. */
export const PROOF_VIDEO_MAX_FILE_BYTES = 40 * 1024 * 1024
const MAX_REQUEST_LENGTH = 1024

export function proofMediaRoot(): string {
  return path.join(homedir(), ...NATIVE_CHAT_PROOF_ROOT_HOME_RELATIVE)
}

type Resolved = { ok: true; path: string } | { ok: false; reason: NativeChatProofMediaRefusal }

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** The real path of a proof file, or why it is refused. Exported for tests. */
export async function resolveProofMediaPath(
  requested: unknown,
  type: NativeChatProofMediaType,
  root: string
): Promise<Resolved> {
  if (
    typeof requested !== 'string' ||
    requested.length === 0 ||
    requested.length > MAX_REQUEST_LENGTH ||
    requested.includes('\0') ||
    requested.split(/[\\/]/).includes('..')
  ) {
    return { ok: false, reason: 'invalid-path' }
  }
  const realRoot = await realpath(root).catch(() => null)
  if (realRoot === null) {
    return { ok: false, reason: 'folder-missing' }
  }
  let candidate: string
  if (path.isAbsolute(requested)) {
    if (!inside(root, requested) && !inside(realRoot, requested)) {
      return { ok: false, reason: 'outside-folder' }
    }
    candidate = requested
  } else {
    candidate = path.join(realRoot, requested)
  }
  if (!hasNativeChatProofExtension(candidate, type)) {
    return { ok: false, reason: 'wrong-type' }
  }
  const realCandidate = await realpath(candidate).catch(() => null)
  if (realCandidate === null) {
    return { ok: false, reason: 'missing' }
  }
  if (!inside(realRoot, realCandidate)) {
    return { ok: false, reason: 'outside-folder' }
  }
  // A link inside the folder may not rename another kind of file into this one.
  return hasNativeChatProofExtension(realCandidate, type)
    ? { ok: true, path: realCandidate }
    : { ok: false, reason: 'wrong-type' }
}

const IMAGE_REFUSALS: Record<string, NativeChatProofMediaRefusal> = {
  'invalid-path': 'invalid-path',
  'cache-missing': 'folder-missing',
  'outside-cache': 'outside-folder',
  'not-image': 'wrong-type',
  missing: 'missing',
  'too-large': 'too-large',
  'too-large-to-send': 'too-large'
}

export async function readProofImage(args: {
  path: unknown
  variant: NativeChatSlackImageVariant
  root?: string
  codec?: SlackCacheImageCodec | null
}): Promise<NativeChatProofImageReply> {
  const root = args.root ?? proofMediaRoot()
  const resolved = await resolveProofMediaPath(args.path, 'image', root)
  if (!resolved.ok) {
    return resolved
  }
  // The Slack card reader already bounds, sniffs and thumbnails images in a folder.
  const read = await readSlackCacheImage({
    path: resolved.path,
    variant: args.variant,
    maxBytes: PROOF_IMAGE_MAX_FILE_BYTES,
    root,
    ...(args.codec === undefined ? {} : { codec: args.codec })
  })
  return read.ok
    ? { ok: true, image: read.image }
    : { ok: false, reason: IMAGE_REFUSALS[read.reason] ?? 'unavailable' }
}

function sniffVideo(bytes: Buffer): NativeChatProofVideoMime | null {
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3) {
    return 'video/webm'
  }
  if (bytes.length < 12) {
    return null
  }
  const box = bytes.subarray(4, 8).toString('latin1')
  if (box === 'ftyp') {
    return bytes.subarray(8, 12).toString('latin1') === 'qt  ' ? 'video/quicktime' : 'video/mp4'
  }
  // Older QuickTime files can open on another top-level atom.
  return ['moov', 'mdat', 'wide', 'free', 'skip'].includes(box) ? 'video/quicktime' : null
}

export async function readProofVideo(args: {
  path: unknown
  root?: string
  maxBytes?: number
}): Promise<NativeChatProofVideoReply> {
  const resolved = await resolveProofMediaPath(args.path, 'video', args.root ?? proofMediaRoot())
  if (!resolved.ok) {
    return resolved
  }
  const handle = await open(resolved.path, 'r').catch(() => null)
  if (!handle) {
    return { ok: false, reason: 'missing' }
  }
  try {
    // Size is checked on the open handle, so a swap after realpath cannot grow the read.
    const info = await handle.stat()
    if (!info.isFile()) {
      return { ok: false, reason: 'missing' }
    }
    if (info.size > (args.maxBytes ?? PROOF_VIDEO_MAX_FILE_BYTES)) {
      return { ok: false, reason: 'too-large' }
    }
    const bytes = Buffer.alloc(info.size)
    const { bytesRead } = await handle.read(bytes, 0, info.size, 0)
    const mimeType = sniffVideo(bytes)
    return mimeType === null
      ? { ok: false, reason: 'wrong-type' }
      : { ok: true, mimeType, bytes: bytes.subarray(0, bytesRead) }
  } finally {
    await handle.close()
  }
}
