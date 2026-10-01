// Reads a Slack card image from slack-mcp's download cache on this host, for the
// desktop renderer (IPC) and paired clients (runtime RPC). The cache folder is the
// only thing it ever reads: a path is resolved with realpath and refused when it
// lands outside the folder, is not a bounded image file, or does not sniff as one.
// It never touches the network.

import { open, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  hasNativeChatSlackImageExtension,
  SLACK_MCP_IMAGE_CACHE_HOME_RELATIVE
} from '../../shared/native-chat-slack-image-path'
import {
  NATIVE_CHAT_SLACK_IMAGE_THUMBNAIL_WIDTH,
  type NativeChatSlackImageResult,
  type NativeChatSlackImageVariant
} from '../../shared/native-chat-slack-image-contract'

export const SLACK_CACHE_IMAGE_MAX_FILE_BYTES = 10 * 1024 * 1024
export const SLACK_CACHE_IMAGE_THUMBNAIL_MAX_BYTES = 1024 * 1024
const MAX_REQUEST_LENGTH = 1024
const FULL_REENCODE_WIDTH = 2048

export type SlackCacheImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

/** Decodes and re-encodes images; Electron's nativeImage in the app, absent on a bare Node host. */
export type SlackCacheImageCodec = {
  decode: (bytes: Buffer) => {
    width: number
    height: number
    resizeToWidth: (width: number) => { png: () => Buffer; jpeg: (quality: number) => Buffer }
  } | null
}

let registeredCodec: SlackCacheImageCodec | null = null

/** Installed by the Electron main process; the runtime cannot import Electron itself. */
export function setSlackCacheImageCodec(codec: SlackCacheImageCodec | null): void {
  registeredCodec = codec
}

export function slackCacheImageRoot(): string {
  return path.join(homedir(), ...SLACK_MCP_IMAGE_CACHE_HOME_RELATIVE)
}

export type SlackCacheImageRefusal =
  | 'invalid-path'
  | 'cache-missing'
  | 'outside-cache'
  | 'not-image'
  | 'missing'
  | 'too-large'
  | 'too-large-to-send'

export type SlackCacheImageRead =
  | { ok: true; image: NativeChatSlackImageResult }
  | { ok: false; reason: SlackCacheImageRefusal }

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** The real path of a cache file, or why it is refused. Exported for tests. */
export async function resolveSlackCacheImagePath(
  requested: string,
  root: string
): Promise<{ ok: true; path: string } | { ok: false; reason: SlackCacheImageRefusal }> {
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
    return { ok: false, reason: 'cache-missing' }
  }
  let candidate: string
  if (path.isAbsolute(requested)) {
    if (!inside(root, requested) && !inside(realRoot, requested)) {
      return { ok: false, reason: 'outside-cache' }
    }
    candidate = requested
  } else {
    candidate = path.join(realRoot, requested)
  }
  if (!hasNativeChatSlackImageExtension(candidate)) {
    return { ok: false, reason: 'not-image' }
  }
  const realCandidate = await realpath(candidate).catch(() => null)
  if (realCandidate === null) {
    return { ok: false, reason: 'missing' }
  }
  if (!inside(realRoot, realCandidate)) {
    return { ok: false, reason: 'outside-cache' }
  }
  // A link inside the cache may not rename a non-image into one.
  return hasNativeChatSlackImageExtension(realCandidate)
    ? { ok: true, path: realCandidate }
    : { ok: false, reason: 'not-image' }
}

function sniffMime(bytes: Buffer): SlackCacheImageMime | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  const head = bytes.subarray(0, 12).toString('latin1')
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) {
    return 'image/gif'
  }
  return head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP' ? 'image/webp' : null
}

async function readBounded(filePath: string): Promise<Buffer | 'too-large' | 'missing'> {
  const handle = await open(filePath, 'r').catch(() => null)
  if (!handle) {
    return 'missing'
  }
  try {
    // Size is checked on the open handle, so a swap after realpath cannot grow the read.
    const info = await handle.stat()
    if (!info.isFile()) {
      return 'missing'
    }
    if (info.size > SLACK_CACHE_IMAGE_MAX_FILE_BYTES) {
      return 'too-large'
    }
    const bytes = Buffer.alloc(info.size)
    const { bytesRead } = await handle.read(bytes, 0, info.size, 0)
    return bytes.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function result(
  mimeType: SlackCacheImageMime,
  bytes: Buffer,
  size: { width: number; height: number } | null
): NativeChatSlackImageResult {
  return {
    src: `data:${mimeType};base64,${bytes.toString('base64')}`,
    mimeType,
    width: size?.width ?? null,
    height: size?.height ?? null,
    byteLength: bytes.length
  }
}

/** Re-encodes to at most `width` wide; PNG keeps transparency when it is small enough. */
function reencode(
  decoded: NonNullable<ReturnType<SlackCacheImageCodec['decode']>>,
  mimeType: SlackCacheImageMime,
  width: number,
  maxBytes: number
): NativeChatSlackImageResult | null {
  const targetWidth = Math.min(width, decoded.width)
  const resized = decoded.resizeToWidth(targetWidth)
  const size = {
    width: targetWidth,
    height: Math.max(1, Math.round((decoded.height * targetWidth) / decoded.width))
  }
  if (mimeType === 'image/png') {
    const png = resized.png()
    if (png.length <= maxBytes) {
      return result('image/png', png, size)
    }
  }
  const jpeg = resized.jpeg(82)
  return jpeg.length <= maxBytes ? result('image/jpeg', jpeg, size) : null
}

export type ReadSlackCacheImageArgs = {
  path: string
  variant: NativeChatSlackImageVariant
  /** The largest encoded image the caller can carry. */
  maxBytes: number
  root?: string
  codec?: SlackCacheImageCodec | null
}

export async function readSlackCacheImage(
  args: ReadSlackCacheImageArgs
): Promise<SlackCacheImageRead> {
  const resolved = await resolveSlackCacheImagePath(args.path, args.root ?? slackCacheImageRoot())
  if (!resolved.ok) {
    return resolved
  }
  const bytes = await readBounded(resolved.path)
  if (bytes === 'too-large' || bytes === 'missing') {
    return { ok: false, reason: bytes }
  }
  const mimeType = sniffMime(bytes)
  if (mimeType === null) {
    return { ok: false, reason: 'not-image' }
  }
  const codec = args.codec === undefined ? registeredCodec : args.codec
  const decoded = codec?.decode(bytes) ?? null
  const size = decoded ? { width: decoded.width, height: decoded.height } : null
  const thumbnail = args.variant === 'thumbnail'
  const limit = thumbnail
    ? Math.min(args.maxBytes, SLACK_CACHE_IMAGE_THUMBNAIL_MAX_BYTES)
    : args.maxBytes
  // The original keeps a GIF's frames and a PNG's exact pixels, so it wins whenever it fits.
  const original = bytes.length <= limit ? result(mimeType, bytes, size) : null
  const tooWide = thumbnail && size !== null && size.width > NATIVE_CHAT_SLACK_IMAGE_THUMBNAIL_WIDTH
  if (original && !tooWide) {
    return { ok: true, image: original }
  }
  const width = thumbnail ? NATIVE_CHAT_SLACK_IMAGE_THUMBNAIL_WIDTH : FULL_REENCODE_WIDTH
  const image = (decoded ? reencode(decoded, mimeType, width, limit) : null) ?? original
  return image ? { ok: true, image } : { ok: false, reason: 'too-large-to-send' }
}
