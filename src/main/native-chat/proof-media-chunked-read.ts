// Serves a proof card's media to paired clients (runtime RPC) in bounded slices, from
// this host's ~/.orca-personal/proof/ only. Every call re-resolves and re-sniffs the
// file with the desktop card's checks, so a slice can never come from anywhere else.

import { constants } from 'node:fs'
import { open, realpath, stat, type FileHandle } from 'node:fs/promises'
import {
  hasNativeChatProofExtension,
  type NativeChatProofMediaType
} from '../../shared/native-chat-proof-card-payload'
import {
  NATIVE_CHAT_PROOF_IMAGE_MAX_FILE_BYTES,
  NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES,
  NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES,
  type NativeChatProofMediaInfoReply,
  type NativeChatProofMediaMime,
  type NativeChatProofMediaReadReply,
  type NativeChatProofMediaRpcRefusal
} from '../../shared/native-chat-proof-media-rpc-contract'
import { proofMediaRoot, resolveProofMediaPath, sniffProofVideo } from './proof-media'
import {
  slackCacheImageCodec,
  sniffSlackCacheImageMime,
  type SlackCacheImageCodec
} from './slack-cache-image'

const SNIFF_BYTES = 16

type OpenMedia = {
  handle: FileHandle
  type: NativeChatProofMediaType
  mimeType: NativeChatProofMediaMime
  byteLength: number
  mtimeMs: number
}

type Refused = { ok: false; reason: NativeChatProofMediaRpcRefusal }

function refuse(reason: NativeChatProofMediaRpcRefusal): Refused {
  return { ok: false, reason }
}

function mediaTypeOf(requested: unknown): NativeChatProofMediaType {
  return typeof requested === 'string' && hasNativeChatProofExtension(requested, 'video')
    ? 'video'
    : 'image'
}

async function sniff(
  handle: FileHandle,
  type: NativeChatProofMediaType
): Promise<NativeChatProofMediaMime | null> {
  const head = Buffer.alloc(SNIFF_BYTES)
  const { bytesRead } = await handle.read(head, 0, SNIFF_BYTES, 0)
  const bytes = head.subarray(0, bytesRead)
  return type === 'video' ? sniffProofVideo(bytes) : sniffSlackCacheImageMime(bytes)
}

/** Opens a proof file for one call and always closes it; any refusal comes back typed. */
async function withProofMedia<T extends { ok: boolean }>(
  requested: unknown,
  root: string,
  read: (media: OpenMedia) => Promise<T>
): Promise<T | Refused> {
  const type = mediaTypeOf(requested)
  const resolved = await resolveProofMediaPath(requested, type, root)
  if (!resolved.ok) {
    return resolved
  }
  const noFollow = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW
  const handle = await open(resolved.path, constants.O_RDONLY | noFollow).catch(() => null)
  if (!handle) {
    return refuse('missing')
  }
  try {
    const info = await handle.stat()
    // The open handle must still be the file realpath named, not one swapped in since.
    const again = await realpath(resolved.path).catch(() => null)
    const named = again === resolved.path ? await stat(again).catch(() => null) : null
    if (!info.isFile() || !named || named.ino !== info.ino || named.dev !== info.dev) {
      return refuse('missing')
    }
    const cap =
      type === 'video'
        ? NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES
        : NATIVE_CHAT_PROOF_IMAGE_MAX_FILE_BYTES
    if (info.size > cap) {
      return refuse('too-large')
    }
    const mimeType = await sniff(handle, type)
    if (mimeType === null) {
      return refuse('wrong-type')
    }
    return await read({ handle, type, mimeType, byteLength: info.size, mtimeMs: info.mtimeMs })
  } catch {
    return refuse('unavailable')
  } finally {
    await handle.close().catch(() => undefined)
  }
}

export async function readProofMediaInfo(args: {
  path: unknown
  root?: string
  codec?: SlackCacheImageCodec | null
}): Promise<NativeChatProofMediaInfoReply> {
  return withProofMedia(args.path, args.root ?? proofMediaRoot(), async (media) => {
    const info = {
      ok: true as const,
      type: media.type,
      mimeType: media.mimeType,
      byteLength: media.byteLength,
      mtimeMs: media.mtimeMs
    }
    const codec = args.codec === undefined ? slackCacheImageCodec() : args.codec
    if (media.type !== 'image' || !codec) {
      return info
    }
    const bytes = Buffer.alloc(media.byteLength)
    const { bytesRead } = await media.handle.read(bytes, 0, media.byteLength, 0)
    const decoded = codec.decode(bytes.subarray(0, bytesRead))
    return decoded ? { ...info, width: decoded.width, height: decoded.height } : info
  })
}

export async function readProofMediaChunk(args: {
  path: unknown
  offset: number
  length: number
  byteLength: number
  mtimeMs: number
  root?: string
}): Promise<NativeChatProofMediaReadReply> {
  if (
    !Number.isSafeInteger(args.offset) ||
    args.offset < 0 ||
    !Number.isSafeInteger(args.length) ||
    args.length < 1
  ) {
    return refuse('bad-range')
  }
  return withProofMedia(args.path, args.root ?? proofMediaRoot(), async (media) => {
    if (media.byteLength !== args.byteLength || media.mtimeMs !== args.mtimeMs) {
      return refuse('changed')
    }
    if (args.offset > media.byteLength) {
      return refuse('bad-range')
    }
    const length = Math.min(
      args.length,
      NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES,
      media.byteLength - args.offset
    )
    const bytes = Buffer.alloc(length)
    const { bytesRead } = await media.handle.read(bytes, 0, length, args.offset)
    // A write landing mid-read is caught here rather than on the next slice.
    const after = await media.handle.stat()
    if (
      after.size !== media.byteLength ||
      after.mtimeMs !== media.mtimeMs ||
      bytesRead !== length
    ) {
      return refuse('changed')
    }
    return {
      ok: true as const,
      base64: bytes.toString('base64'),
      offset: args.offset,
      bytesRead,
      eof: args.offset + bytesRead >= media.byteLength
    }
  })
}
