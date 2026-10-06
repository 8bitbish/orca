// Serves one rectangle of a proof image to a zoomed viewer (`nativeChat.proofImageRegion`),
// from this host's ~/.orca-personal/proof/ only. The file is opened with the chunked
// reader's checks, decoded once, and the bitmap kept briefly so a pan's tiles do not each
// decode the whole file again.

import {
  NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_BYTES,
  NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_PIXELS,
  NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_WIDTH,
  type NativeChatProofImageRegionReply,
  type NativeChatProofImageRegionRequest
} from '../../shared/native-chat-proof-image-region-contract'
import { ProofImageCache } from './proof-image-cache'
import { proofMediaRoot, rememberProofImageSize } from './proof-media'
import {
  refuse,
  withProofMedia,
  type OpenProofMedia,
  type Refused
} from './proof-media-chunked-read'
import {
  slackCacheImageCodec,
  type SlackCacheDecodedImage,
  type SlackCacheImageCodec
} from './slack-cache-image'

/**
 * Decoded bitmaps are width × height × 4 bytes: two 45 MP Figma boards fit, so a viewer can
 * flip between before and after. A larger image is decoded per request and never kept.
 */
export const PROOF_IMAGE_BITMAP_CACHE_LIMITS = {
  maxEntries: 2,
  maxBytes: 384 * 1024 * 1024,
  ttlMs: 30_000
}
const JPEG_QUALITIES = [85, 72, 60] as const
const SHRINK_STEP = 0.75
const MIN_OUTPUT_WIDTH = 64

type Decoded = { ok: true; image: SlackCacheDecodedImage } | Refused

const bitmaps = new ProofImageCache<SlackCacheDecodedImage, Decoded>(
  PROOF_IMAGE_BITMAP_CACHE_LIMITS,
  (image) => image.width * image.height * 4
)

/** Drops every kept bitmap. Exported for tests. */
export function clearProofImageBitmaps(): void {
  bitmaps.clear()
}

async function decodeOpenImage(
  media: OpenProofMedia,
  codec: SlackCacheImageCodec
): Promise<Decoded> {
  const bytes = Buffer.alloc(media.byteLength)
  const { bytesRead } = await media.handle.read(bytes, 0, media.byteLength, 0)
  // A write landing mid-read would decode a torn file; refuse it rather than cache it.
  const after = await media.handle.stat()
  if (
    bytesRead !== media.byteLength ||
    after.size !== media.byteLength ||
    after.mtimeMs !== media.mtimeMs
  ) {
    return refuse('changed')
  }
  const image = codec.decode(bytes)
  if (!image) {
    return refuse('unavailable')
  }
  rememberProofImageSize(media.cacheKey, image)
  return { ok: true, image }
}

function isCount(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min
}

/** The output width: the region's own, capped by maxWidth, the host cap and the pixel budget. */
export function proofImageRegionOutputWidth(
  width: number,
  height: number,
  maxWidth: number
): number {
  const byArea = Math.floor(Math.sqrt((NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_PIXELS * width) / height))
  return Math.max(1, Math.min(width, maxWidth, NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_WIDTH, byArea))
}

/** JPEG of the cropped region under the byte cap: lower quality first, then fewer pixels. */
function encodeRegion(
  cropped: SlackCacheDecodedImage,
  startWidth: number,
  maxBytes: number
): { jpeg: Buffer; width: number } | null {
  for (let width = startWidth; ; width = Math.floor(width * SHRINK_STEP)) {
    const resized = cropped.resizeToWidth(width)
    for (const quality of JPEG_QUALITIES) {
      const jpeg = resized.jpeg(quality)
      if (jpeg.length <= maxBytes) {
        return { jpeg, width }
      }
    }
    if (width <= MIN_OUTPUT_WIDTH) {
      return null
    }
  }
}

export async function readProofImageRegion(
  args: Partial<Omit<NativeChatProofImageRegionRequest, 'path'>> & {
    path: unknown
    root?: string
    codec?: SlackCacheImageCodec | null
    /** Tests only: a smaller byte cap. */
    maxBytes?: number
  }
): Promise<NativeChatProofImageRegionReply> {
  const { x, y, width, height, maxWidth } = args
  if (
    !isCount(x, 0) ||
    !isCount(y, 0) ||
    !isCount(width, 1) ||
    !isCount(height, 1) ||
    !isCount(maxWidth, 1)
  ) {
    return refuse('bad-range')
  }
  const codec = args.codec === undefined ? slackCacheImageCodec() : args.codec
  return withProofMedia(args.path, args.root ?? proofMediaRoot(), async (media) => {
    if (media.type !== 'image') {
      return refuse('wrong-type')
    }
    // A bare Node host has no codec to crop with; the phone falls back to the whole file.
    if (!codec) {
      return refuse('unavailable')
    }
    const decoded = await bitmaps.getOrLoad(
      media.cacheKey,
      (image) => ({ ok: true, image }),
      () => decodeOpenImage(media, codec),
      (result) => (result.ok ? result.image : null)
    )
    if (!decoded.ok) {
      return decoded
    }
    const source = decoded.image
    if (x >= source.width || y >= source.height) {
      return refuse('bad-range')
    }
    const rect = {
      x,
      y,
      width: Math.min(width, source.width - x),
      height: Math.min(height, source.height - y)
    }
    if (!source.crop) {
      return refuse('unavailable')
    }
    const encoded = encodeRegion(
      source.crop(rect),
      proofImageRegionOutputWidth(rect.width, rect.height, maxWidth),
      Math.min(args.maxBytes ?? Infinity, NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_BYTES)
    )
    if (!encoded) {
      return refuse('too-large')
    }
    return {
      ok: true as const,
      base64: encoded.jpeg.toString('base64'),
      mimeType: 'image/jpeg' as const,
      sourceWidth: source.width,
      sourceHeight: source.height,
      ...rect,
      outputWidth: encoded.width,
      outputHeight: Math.max(1, Math.round((rect.height * encoded.width) / rect.width))
    }
  })
}
