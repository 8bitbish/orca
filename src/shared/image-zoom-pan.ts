// Zoom and pan arithmetic for a full-screen image viewer, shared by the desktop
// dialog (wheel, trackpad pinch, drag) and the mobile viewer (touch). Pure and
// DOM-free so it runs under Hermes.
//
// A view places the image in its viewport: `scale` is display pixels per image
// pixel, and `x`/`y` are where the image's top-left corner sits in the viewport.

export type ImageZoomSize = { width: number; height: number }
export type ImageZoomPoint = { x: number; y: number }
export type ImageZoomView = { scale: number; x: number; y: number }
export type ImageZoomFit = 'screen' | 'width' | 'actual'

/** Largest zoom, in display pixels per image pixel (800%). */
export const IMAGE_ZOOM_MAX_SCALE = 8
/** One keyboard or button zoom step. */
export const IMAGE_ZOOM_STEP = 1.25

const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2
const PIXELS_PER_LINE = 16
const PIXELS_PER_PAGE = 800
const MAX_WHEEL_ZOOM_DELTA = 200
const WHEEL_ZOOM_SENSITIVITY = 300
/** Scales this close count as the same, so a fit view reads as "at fit". */
const SCALE_EPSILON = 0.001

function usable(size: ImageZoomSize | null | undefined): size is ImageZoomSize {
  return (
    size != null &&
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  )
}

/** The scale that shows the whole image, never enlarging a small one. */
export function imageZoomFitScale(image: ImageZoomSize, viewport: ImageZoomSize): number {
  if (!usable(image) || !usable(viewport)) {
    return 1
  }
  return Math.min(1, viewport.width / image.width, viewport.height / image.height)
}

/** The scale that fills the viewport's width, never enlarging a small image. */
export function imageZoomFitWidthScale(image: ImageZoomSize, viewport: ImageZoomSize): number {
  if (!usable(image) || !usable(viewport)) {
    return 1
  }
  return Math.min(1, viewport.width / image.width)
}

/** The scale that covers the whole viewport (the image may overflow one side). */
export function imageZoomFillScale(image: ImageZoomSize, viewport: ImageZoomSize): number {
  if (!usable(image) || !usable(viewport)) {
    return 1
  }
  return Math.max(viewport.width / image.width, viewport.height / image.height)
}

/** How far out and in this image may zoom: out to fit, in to 800% or 8× fit. */
export function imageZoomScaleBounds(
  image: ImageZoomSize,
  viewport: ImageZoomSize
): { min: number; max: number } {
  const fit = imageZoomFitScale(image, viewport)
  return { min: fit, max: Math.max(IMAGE_ZOOM_MAX_SCALE, fit * IMAGE_ZOOM_MAX_SCALE) }
}

export function clampImageZoomScale(
  scale: number,
  image: ImageZoomSize,
  viewport: ImageZoomSize
): number {
  const { min, max } = imageZoomScaleBounds(image, viewport)
  if (!Number.isFinite(scale)) {
    return min
  }
  return Math.min(max, Math.max(min, scale))
}

function clampAxis(offset: number, displayed: number, available: number): number {
  // Smaller than the viewport: centre it. Larger: keep the viewport covered.
  if (displayed <= available) {
    return (available - displayed) / 2
  }
  return Math.min(0, Math.max(available - displayed, offset))
}

/** The view with its scale in bounds and its offset kept inside the pan limits. */
export function clampImageZoomView(
  view: ImageZoomView,
  image: ImageZoomSize,
  viewport: ImageZoomSize
): ImageZoomView {
  if (!usable(image) || !usable(viewport)) {
    return { scale: 1, x: 0, y: 0 }
  }
  const scale = clampImageZoomScale(view.scale, image, viewport)
  return {
    scale,
    x: clampAxis(Number.isFinite(view.x) ? view.x : 0, image.width * scale, viewport.width),
    y: clampAxis(Number.isFinite(view.y) ? view.y : 0, image.height * scale, viewport.height)
  }
}

/** A fitted view: the whole image, the full width from the top, or actual pixels from the top. */
export function imageZoomFitView(
  image: ImageZoomSize,
  viewport: ImageZoomSize,
  fit: ImageZoomFit = 'screen'
): ImageZoomView {
  const scale =
    fit === 'screen'
      ? imageZoomFitScale(image, viewport)
      : fit === 'width'
        ? imageZoomFitWidthScale(image, viewport)
        : 1
  // Clamping centres whatever fits; a taller image starts at its top.
  return clampImageZoomView({ scale, x: 0, y: 0 }, image, viewport)
}

/** Zooms to `scale` keeping the image point under `anchor` (viewport coordinates) still. */
export function zoomImageViewAt(
  view: ImageZoomView,
  scale: number,
  anchor: ImageZoomPoint,
  image: ImageZoomSize,
  viewport: ImageZoomSize
): ImageZoomView {
  const next = clampImageZoomScale(scale, image, viewport)
  if (!(view.scale > 0)) {
    return clampImageZoomView({ scale: next, x: 0, y: 0 }, image, viewport)
  }
  const ratio = next / view.scale
  return clampImageZoomView(
    {
      scale: next,
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio
    },
    image,
    viewport
  )
}

/** Zooms by a factor (>1 in, <1 out) around `anchor`, or the viewport centre. */
export function zoomImageViewBy(
  view: ImageZoomView,
  factor: number,
  image: ImageZoomSize,
  viewport: ImageZoomSize,
  anchor?: ImageZoomPoint
): ImageZoomView {
  const point = anchor ?? { x: viewport.width / 2, y: viewport.height / 2 }
  return zoomImageViewAt(view, view.scale * factor, point, image, viewport)
}

/** Moves the image by `dx`/`dy` display pixels, within the pan limits. */
export function panImageView(
  view: ImageZoomView,
  dx: number,
  dy: number,
  image: ImageZoomSize,
  viewport: ImageZoomSize
): ImageZoomView {
  return clampImageZoomView({ ...view, x: view.x + dx, y: view.y + dy }, image, viewport)
}

/** Whether the view is (about) at the whole-image fit. */
export function isImageZoomAtFit(
  view: ImageZoomView,
  image: ImageZoomSize,
  viewport: ImageZoomSize
): boolean {
  return Math.abs(view.scale - imageZoomFitScale(image, viewport)) < SCALE_EPSILON
}

/** Double-click or double-tap: from fit to actual pixels (or 2× when the image already
 *  shows at full size) around the point, and from anywhere else back to fit. */
export function toggleImageZoomAt(
  view: ImageZoomView,
  anchor: ImageZoomPoint,
  image: ImageZoomSize,
  viewport: ImageZoomSize
): ImageZoomView {
  if (!isImageZoomAtFit(view, image, viewport)) {
    return imageZoomFitView(image, viewport, 'screen')
  }
  const fit = imageZoomFitScale(image, viewport)
  const target = fit < 1 - SCALE_EPSILON ? 1 : fit * 2
  return zoomImageViewAt(view, target, anchor, image, viewport)
}

/** Keeps what is on screen when the image is swapped for a different-size copy of
 *  itself (a thumbnail replaced by the full file). */
export function rescaleImageViewForSource(
  view: ImageZoomView,
  previous: ImageZoomSize,
  next: ImageZoomSize,
  viewport: ImageZoomSize
): ImageZoomView {
  if (!usable(previous) || !usable(next)) {
    return imageZoomFitView(next, viewport)
  }
  return clampImageZoomView(
    { scale: (view.scale * previous.width) / next.width, x: view.x, y: view.y },
    next,
    viewport
  )
}

/** A wheel delta in pixels, whatever unit the device reported it in. */
export function imageZoomWheelPixels(delta: number, deltaMode: number): number {
  if (!Number.isFinite(delta)) {
    return 0
  }
  return deltaMode === DOM_DELTA_LINE
    ? delta * PIXELS_PER_LINE
    : deltaMode === DOM_DELTA_PAGE
      ? delta * PIXELS_PER_PAGE
      : delta
}

/** The zoom factor for one ctrl-wheel event (a trackpad pinch arrives as one). */
export function imageZoomWheelFactor(deltaY: number, deltaMode: number): number {
  const pixels = imageZoomWheelPixels(deltaY, deltaMode)
  if (pixels === 0) {
    return 1
  }
  const bounded = Math.max(-MAX_WHEEL_ZOOM_DELTA, Math.min(MAX_WHEEL_ZOOM_DELTA, pixels))
  return Math.exp(-bounded / WHEEL_ZOOM_SENSITIVITY)
}

/** A pinch gesture's scale from its starting and current finger spread. */
export function imageZoomPinchScale(
  startScale: number,
  startDistance: number,
  distance: number
): number {
  if (!(startDistance > 0) || !(distance > 0)) {
    return startScale
  }
  return startScale * (distance / startDistance)
}
