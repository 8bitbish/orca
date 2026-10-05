// Touch handling for the full-screen image viewer, kept apart from PanResponder so it can
// be tested. The zoom and pan arithmetic itself is the shared desktop module's.
import {
  isImageZoomAtFit,
  imageZoomPinchScale,
  panImageView,
  toggleImageZoomAt,
  zoomImageViewAt,
  type ImageZoomPoint,
  type ImageZoomSize,
  type ImageZoomView
} from '../../../../src/shared/image-zoom-pan'

/** Finger travel, in points, under which a touch still counts as a tap. */
export const IMAGE_VIEWER_TAP_SLOP = 8
/** Two taps this close in time and place make a double-tap. */
export const IMAGE_VIEWER_DOUBLE_TAP_MS = 300
const DOUBLE_TAP_DISTANCE = 32

/** A finger, in viewport coordinates. */
export type ImageViewerTouch = ImageZoomPoint

export type ImageViewerGesture = {
  startView: ImageZoomView
  touches: readonly ImageViewerTouch[]
  /** Where the first finger went down, for a tap. */
  origin: ImageViewerTouch
  /** Moved past the tap slop, or used two fingers, at any point in this gesture. */
  moved: boolean
}

export type ImageViewerTap = { at: ImageViewerTouch; time: number }

function centre(touches: readonly ImageViewerTouch[]): ImageViewerTouch {
  const [a, b] = touches
  return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a
}

function spread(touches: readonly ImageViewerTouch[]): number {
  const [a, b] = touches
  return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

/** A gesture from the current view; also called again whenever the finger count changes. */
export function startImageViewerGesture(
  view: ImageZoomView,
  touches: readonly ImageViewerTouch[],
  previous?: ImageViewerGesture
): ImageViewerGesture {
  const kept = touches.slice(0, 2)
  return {
    startView: view,
    touches: kept,
    origin: previous?.origin ?? kept[0] ?? { x: 0, y: 0 },
    moved: (previous?.moved ?? false) || kept.length > 1
  }
}

/** The view for the fingers' new positions: one finger pans, two pinch around their
 *  centre and pan as that centre moves. */
export function moveImageViewerGesture(
  gesture: ImageViewerGesture,
  touches: readonly ImageViewerTouch[],
  image: ImageZoomSize,
  viewport: ImageZoomSize
): { gesture: ImageViewerGesture; view: ImageZoomView } {
  const now = touches.slice(0, 2)
  if (now.length === 0 || now.length !== gesture.touches.length) {
    return { gesture, view: gesture.startView }
  }
  const from = centre(gesture.touches)
  const to = centre(now)
  const travel = Math.hypot(now[0].x - gesture.origin.x, now[0].y - gesture.origin.y)
  const moved = gesture.moved || travel >= IMAGE_VIEWER_TAP_SLOP
  let view = gesture.startView
  if (now.length > 1) {
    const scale = imageZoomPinchScale(view.scale, spread(gesture.touches), spread(now))
    view = zoomImageViewAt(view, scale, from, image, viewport)
  }
  view = panImageView(view, to.x - from.x, to.y - from.y, image, viewport)
  return { gesture: { ...gesture, moved }, view }
}

function insideImage(view: ImageZoomView, point: ImageViewerTouch, image: ImageZoomSize): boolean {
  return (
    point.x >= view.x &&
    point.y >= view.y &&
    point.x <= view.x + image.width * view.scale &&
    point.y <= view.y + image.height * view.scale
  )
}

export type ImageViewerTapAction =
  | { action: 'toggle'; view: ImageZoomView }
  | { action: 'close' }
  | { action: 'none' }

/** What a tap does: a second quick tap toggles fit and 100% around it; a tap beside the
 *  image at fit closes the viewer; anything else waits for a possible second tap. */
export function imageViewerTapAction(
  view: ImageZoomView,
  tap: ImageViewerTap,
  previous: ImageViewerTap | null,
  image: ImageZoomSize,
  viewport: ImageZoomSize
): ImageViewerTapAction {
  if (
    previous !== null &&
    tap.time - previous.time <= IMAGE_VIEWER_DOUBLE_TAP_MS &&
    Math.hypot(tap.at.x - previous.at.x, tap.at.y - previous.at.y) <= DOUBLE_TAP_DISTANCE
  ) {
    return { action: 'toggle', view: toggleImageZoomAt(view, tap.at, image, viewport) }
  }
  if (isImageZoomAtFit(view, image, viewport) && !insideImage(view, tap.at, image)) {
    return { action: 'close' }
  }
  return { action: 'none' }
}
