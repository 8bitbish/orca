import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  clampImageZoomView,
  IMAGE_ZOOM_STEP,
  imageZoomFitView,
  imageZoomWheelFactor,
  imageZoomWheelPixels,
  panImageView,
  rescaleImageViewForSource,
  toggleImageZoomAt,
  zoomImageViewAt,
  zoomImageViewBy,
  type ImageZoomFit,
  type ImageZoomPoint,
  type ImageZoomSize,
  type ImageZoomView
} from '../../../../shared/image-zoom-pan'

/** Movement, in pixels, after which a press is a drag rather than a click. */
export const NATIVE_CHAT_IMAGE_CLICK_SLOP = 4
const KEY_PAN_STEP = 64

type Press = {
  pointerId: number
  startX: number
  startY: number
  startView: ImageZoomView
  moved: boolean
}

export type NativeChatImageZoom = {
  setSurface: (element: HTMLDivElement | null) => void
  view: ImageZoomView | null
  image: ImageZoomSize | null
  dragging: boolean
  /** Whether the image is larger than the viewport, so dragging moves it. */
  pannable: boolean
  onImageLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerCancel: () => void
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  zoomIn: () => void
  zoomOut: () => void
  fit: (mode: ImageZoomFit) => void
}

function localPoint(surface: HTMLElement, clientX: number, clientY: number): ImageZoomPoint {
  const rect = surface.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

/** Zoom and pan state for one image in a viewport: wheel, trackpad pinch (ctrl-wheel),
 *  drag, double-click and keys. A click that does not land on the image dismisses. */
export function useNativeChatImageZoom(onDismiss: () => void): NativeChatImageZoom {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState<ImageZoomSize | null>(null)
  const [image, setImage] = useState<ImageZoomSize | null>(null)
  const [view, setView] = useState<ImageZoomView | null>(null)
  const [dragging, setDragging] = useState(false)
  const touched = useRef(false)
  const press = useRef<Press | null>(null)
  // Event listeners read the latest values without re-subscribing.
  const latest = useRef({ viewport, image, view })
  useLayoutEffect(() => {
    latest.current = { viewport, image, view }
  })

  useEffect(() => {
    if (!surface) {
      return
    }
    const measure = (): void => {
      const { width, height } = surface.getBoundingClientRect()
      setViewport((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height }
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [surface])

  // Until someone zooms or pans, the image follows the viewport's fit.
  useEffect(() => {
    if (!viewport || !image) {
      return
    }
    setView((current) =>
      !touched.current || !current
        ? imageZoomFitView(image, viewport)
        : clampImageZoomView(current, image, viewport)
    )
  }, [viewport, image])

  const update = useCallback(
    (
      next: (view: ImageZoomView, image: ImageZoomSize, viewport: ImageZoomSize) => ImageZoomView
    ) => {
      const { image: size, viewport: area } = latest.current
      if (!size || !area) {
        return
      }
      touched.current = true
      // Functional, so a burst of wheel events each builds on the last.
      setView((current) => (current ? next(current, size, area) : current))
    },
    []
  )

  const onImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget
    if (!(width > 0 && height > 0)) {
      return
    }
    const next = { width, height }
    const { image: previous, view: current, viewport: area } = latest.current
    if (previous && current && area && touched.current) {
      // A sharper copy (or the other side of a pair) keeps what is on screen.
      setView(rescaleImageViewForSource(current, previous, next, area))
    }
    setImage((old) => (old && old.width === width && old.height === height ? old : next))
  }, [])

  useEffect(() => {
    if (!surface) {
      return
    }
    // A native listener: React's wheel handler is passive and cannot stop the page zooming.
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const point = localPoint(surface, event.clientX, event.clientY)
      if (event.ctrlKey || event.metaKey) {
        const factor = imageZoomWheelFactor(event.deltaY, event.deltaMode)
        update((current, size, area) =>
          zoomImageViewAt(current, current.scale * factor, point, size, area)
        )
        return
      }
      let dx = imageZoomWheelPixels(event.deltaX, event.deltaMode)
      let dy = imageZoomWheelPixels(event.deltaY, event.deltaMode)
      if (event.shiftKey && dx === 0) {
        dx = dy
        dy = 0
      }
      update((current, size, area) => panImageView(current, -dx, -dy, size, area))
    }
    surface.addEventListener('wheel', onWheel, { passive: false })
    return () => surface.removeEventListener('wheel', onWheel)
  }, [surface, update])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const current = latest.current.view
    if (event.button !== 0 || !current) {
      return
    }
    press.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startView: current,
      moved: false
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const active = press.current
      if (!active || active.pointerId !== event.pointerId) {
        return
      }
      const dx = event.clientX - active.startX
      const dy = event.clientY - active.startY
      if (!active.moved && Math.hypot(dx, dy) < NATIVE_CHAT_IMAGE_CLICK_SLOP) {
        return
      }
      if (!active.moved) {
        active.moved = true
        setDragging(true)
      }
      update((_current, size, area) => panImageView(active.startView, dx, dy, size, area))
    },
    [update]
  )

  const endPress = useCallback(() => {
    press.current = null
    setDragging(false)
  }, [])

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const active = press.current
      endPress()
      if (!active || active.pointerId !== event.pointerId || active.moved) {
        return
      }
      const { view: current, image: size } = latest.current
      if (!current || !size) {
        return
      }
      const point = localPoint(event.currentTarget, event.clientX, event.clientY)
      const onImage =
        point.x >= current.x &&
        point.x <= current.x + size.width * current.scale &&
        point.y >= current.y &&
        point.y <= current.y + size.height * current.scale
      if (!onImage) {
        onDismiss()
      }
    },
    [endPress, onDismiss]
  )

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const point = localPoint(event.currentTarget, event.clientX, event.clientY)
      update((current, size, area) => toggleImageZoomAt(current, point, size, area))
    },
    [update]
  )

  const zoomIn = useCallback(
    () => update((current, size, area) => zoomImageViewBy(current, IMAGE_ZOOM_STEP, size, area)),
    [update]
  )
  const zoomOut = useCallback(
    () =>
      update((current, size, area) => zoomImageViewBy(current, 1 / IMAGE_ZOOM_STEP, size, area)),
    [update]
  )
  const fit = useCallback(
    (mode: ImageZoomFit) => update((_current, size, area) => imageZoomFitView(size, area, mode)),
    [update]
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return
      }
      const pan: Record<string, [number, number]> = {
        ArrowLeft: [KEY_PAN_STEP, 0],
        ArrowRight: [-KEY_PAN_STEP, 0],
        ArrowUp: [0, KEY_PAN_STEP],
        ArrowDown: [0, -KEY_PAN_STEP]
      }
      if (event.key === '+' || event.key === '=') {
        zoomIn()
      } else if (event.key === '-' || event.key === '_') {
        zoomOut()
      } else if (event.key === '0') {
        fit('screen')
      } else if (event.key in pan && !(event.target instanceof HTMLButtonElement)) {
        const [dx, dy] = pan[event.key]
        update((current, size, area) => panImageView(current, dx, dy, size, area))
      } else {
        return
      }
      event.preventDefault()
    },
    [fit, update, zoomIn, zoomOut]
  )

  const pannable = Boolean(
    view &&
    image &&
    viewport &&
    (image.width * view.scale > viewport.width + 0.5 ||
      image.height * view.scale > viewport.height + 0.5)
  )

  return {
    setSurface,
    view,
    image,
    dragging,
    pannable,
    onImageLoad,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: endPress,
    onDoubleClick,
    onKeyDown,
    zoomIn,
    zoomOut,
    fit
  }
}
