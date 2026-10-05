// What the host returns for a Slack card image, over desktop IPC
// (`nativeChat:slackImage`) and runtime RPC (`nativeChat.slackImage`) alike.

export type NativeChatSlackImageVariant = 'thumbnail' | 'full'

/** Thumbnails are scaled down to at most this many pixels wide. */
export const NATIVE_CHAT_SLACK_IMAGE_THUMBNAIL_WIDTH = 1024
/** ...and to at most this many pixels in all, so a very tall image is not decoded at
 *  full height for a small frame. */
export const NATIVE_CHAT_SLACK_IMAGE_THUMBNAIL_MAX_PIXELS = 1024 * 2048

export type NativeChatSlackImageResult = {
  /** A `data:image/…;base64,` URI. */
  src: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  /** Null when the host could not decode the image to measure it. */
  width: number | null
  height: number | null
  byteLength: number
}

export type NativeChatSlackImageRequest = {
  /** A card image's cache-relative path. */
  path: string
  variant: NativeChatSlackImageVariant
}

const IMAGE_DATA_URI = /^data:(image\/(?:png|jpeg|gif|webp));base64,[A-Za-z0-9+/]+={0,2}$/

function dimension(value: unknown): number | null | undefined {
  if (value === null) {
    return null
  }
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

/** A host's reply, kept only when it is the documented shape with a raster data URI. */
export function parseNativeChatSlackImageResult(value: unknown): NativeChatSlackImageResult | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const src = 'src' in value ? value.src : undefined
  const match = typeof src === 'string' ? IMAGE_DATA_URI.exec(src) : null
  const mimeType = 'mimeType' in value ? value.mimeType : undefined
  const width = dimension('width' in value ? value.width : null)
  const height = dimension('height' in value ? value.height : null)
  const byteLength = 'byteLength' in value ? value.byteLength : undefined
  if (
    !match ||
    typeof src !== 'string' ||
    (mimeType !== 'image/png' &&
      mimeType !== 'image/jpeg' &&
      mimeType !== 'image/gif' &&
      mimeType !== 'image/webp') ||
    match[1] !== mimeType ||
    width === undefined ||
    height === undefined ||
    typeof byteLength !== 'number'
  ) {
    return null
  }
  return { src, mimeType, width, height, byteLength }
}
