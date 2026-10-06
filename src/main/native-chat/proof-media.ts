// Reads a proof card's media from ~/.orca-personal/proof/ on this Mac, for the
// desktop chat. That folder is the only thing it reads: a path is resolved with
// realpath and refused when it lands outside the folder, has the wrong extension,
// is too large, or does not sniff as the kind of file it claims to be.

import { open, realpath, stat } from 'node:fs/promises'
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
import {
  NATIVE_CHAT_PROOF_IMAGE_MAX_FILE_BYTES,
  NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES
} from '../../shared/native-chat-proof-media-rpc-contract'
import {
  NATIVE_CHAT_SLACK_IMAGE_THUMBNAIL_MAX_PIXELS,
  NATIVE_CHAT_SLACK_IMAGE_THUMBNAIL_WIDTH,
  type NativeChatSlackImageVariant
} from '../../shared/native-chat-slack-image-contract'
import { ProofImageCache, proofImageCacheKey } from './proof-image-cache'
import {
  readSlackCacheImage,
  slackCacheImageCodec,
  type SlackCacheDecodedImage,
  type SlackCacheImageCodec
} from './slack-cache-image'

export const PROOF_IMAGE_MAX_FILE_BYTES = NATIVE_CHAT_PROOF_IMAGE_MAX_FILE_BYTES
/** Recordings are meant to be under ~5 MB; this leaves room without letting a stray file through. */
export const PROOF_VIDEO_MAX_FILE_BYTES = NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES
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

type ProofImageSize = { width: number; height: number }

/** Encoded thumbnails (each at most 1 MB): enough for a long chat's cards, a few tens of MB at most. */
export const PROOF_THUMBNAIL_CACHE_LIMITS = { maxEntries: 48, maxBytes: 32 * 1024 * 1024 }
const THUMBNAIL_KEY = `thumbnail:${NATIVE_CHAT_SLACK_IMAGE_THUMBNAIL_WIDTH}:${NATIVE_CHAT_SLACK_IMAGE_THUMBNAIL_MAX_PIXELS}`

const thumbnails = new ProofImageCache<
  Extract<NativeChatProofImageReply, { ok: true }>,
  NativeChatProofImageReply
>(PROOF_THUMBNAIL_CACHE_LIMITS, (reply) => reply.image.src.length)
// Source sizes, so the full variant and the phone's info call need no decode once known.
const sizes = new ProofImageCache<ProofImageSize>({ maxEntries: 512, maxBytes: 512 }, () => 1)

/** Drops every cached thumbnail and size. Exported for tests. */
export function clearProofImageCaches(): void {
  thumbnails.clear()
  sizes.clear()
}

export function knownProofImageSize(key: string): ProofImageSize | undefined {
  return sizes.get(key)
}

export function rememberProofImageSize(key: string, size: ProofImageSize): void {
  sizes.set(key, { width: size.width, height: size.height })
}

/** Answers `decode` from the remembered size and only decodes when pixels are actually needed. */
function sizeMemoCodec(codec: SlackCacheImageCodec, key: string): SlackCacheImageCodec {
  return {
    decode: (bytes) => {
      const known = sizes.get(key)
      if (!known) {
        const decoded = codec.decode(bytes)
        if (decoded) {
          rememberProofImageSize(key, decoded)
        }
        return decoded
      }
      let decoded: SlackCacheDecodedImage | null | undefined
      const pixels = (): SlackCacheDecodedImage => {
        decoded ??= codec.decode(bytes)
        if (!decoded) {
          throw new Error('proof image no longer decodes')
        }
        return decoded
      }
      return { ...known, resizeToWidth: (width) => pixels().resizeToWidth(width) }
    }
  }
}

async function fileKey(realPath: string): Promise<string | null> {
  const info = await stat(realPath).catch(() => null)
  return info?.isFile() ? proofImageCacheKey(realPath, info) : null
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
  const key = await fileKey(resolved.path)
  if (key === null) {
    return { ok: false, reason: 'missing' }
  }
  const baseCodec = args.codec === undefined ? slackCacheImageCodec() : args.codec
  const codec = baseCodec ? sizeMemoCodec(baseCodec, key) : null
  // The Slack card reader already bounds, sniffs and thumbnails images in a folder.
  const read = async (): Promise<NativeChatProofImageReply> => {
    const image = await readSlackCacheImage({
      path: resolved.path,
      variant: args.variant,
      maxBytes: PROOF_IMAGE_MAX_FILE_BYTES,
      root,
      codec
    })
    return image.ok
      ? { ok: true, image: image.image }
      : { ok: false, reason: IMAGE_REFUSALS[image.reason] ?? 'unavailable' }
  }
  if (args.variant !== 'thumbnail') {
    // Full images go straight to the renderer; caching them would hold up to 10 MB each.
    return read()
  }
  let changed = false
  return thumbnails.getOrLoad(
    `${key}\0${THUMBNAIL_KEY}`,
    (cached) => cached,
    async () => {
      const reply = await read()
      // A file written while it was read is answered but not cached under its old key.
      changed = (await fileKey(resolved.path)) !== key
      return reply
    },
    (reply) => (reply.ok && !changed ? reply : null)
  )
}

export function sniffProofVideo(bytes: Buffer): NativeChatProofVideoMime | null {
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
    const mimeType = sniffProofVideo(bytes)
    return mimeType === null
      ? { ok: false, reason: 'wrong-type' }
      : { ok: true, mimeType, bytes: bytes.subarray(0, bytesRead) }
  } finally {
    await handle.close()
  }
}
