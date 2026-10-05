// The fixed frame an image thumbnail sits in, so a card keeps its size whatever the
// image's shape. Shared by the desktop and mobile proof cards; pure, Hermes-safe.

export type ImageThumbnailBox = {
  /** The frame's fixed height. */
  height: number
  minWidth: number
  maxWidth: number
}

export type ImageThumbnailFrame = {
  width: number
  height: number
  /** `contain` shows the whole image; `top` fills the width and crops the bottom. */
  fit: 'contain' | 'top'
  /** Taller than a phone screen, so only the top shows in the frame. */
  tall: boolean
}

/** Height over width past which an image is cropped to its top. Phone screens
 *  (19.5:9 and 20:9, up to about 2.22) still show whole; board exports crop. */
export const IMAGE_THUMBNAIL_TALL_RATIO = 2.25
const UNKNOWN_ASPECT = 16 / 10

export function isTallImage(width?: number | null, height?: number | null): boolean {
  if (!width || !height || width <= 0 || height <= 0) {
    return false
  }
  return height / width > IMAGE_THUMBNAIL_TALL_RATIO
}

/** The frame for an image of this size: a fixed height, a width that follows the
 *  image's shape within the box's bounds, and the widest frame for a tall image. */
export function imageThumbnailFrame(
  width: number | null | undefined,
  height: number | null | undefined,
  box: ImageThumbnailBox
): ImageThumbnailFrame {
  if (isTallImage(width, height)) {
    return { width: box.maxWidth, height: box.height, fit: 'top', tall: true }
  }
  const aspect = width && height && width > 0 && height > 0 ? width / height : UNKNOWN_ASPECT
  const ideal = Math.round(box.height * aspect)
  return {
    width: Math.min(box.maxWidth, Math.max(box.minWidth, ideal)),
    height: box.height,
    fit: 'contain',
    tall: false
  }
}
