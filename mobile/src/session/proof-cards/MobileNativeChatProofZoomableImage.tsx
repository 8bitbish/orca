import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Image,
  PanResponder,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type ImageLoadEventData,
  type LayoutChangeEvent,
  type NativeSyntheticEvent
} from 'react-native'
import {
  IMAGE_ZOOM_STEP,
  clampImageZoomView,
  imageZoomFitView,
  rescaleImageViewForSource,
  zoomImageViewBy,
  type ImageZoomSize,
  type ImageZoomView
} from '../../../../src/shared/image-zoom-pan'
import {
  imageViewerTapAction,
  moveImageViewerGesture,
  startImageViewerGesture,
  type ImageViewerGesture,
  type ImageViewerTap,
  type ImageViewerTouch
} from './mobile-native-chat-image-viewer-gesture'
import {
  proofImageDisplayRect,
  proofTileKey,
  proofTilePlacement,
  type ProofTileRect
} from './mobile-native-chat-proof-image-tiles'
import { useMobileNativeChatProofImageTiles } from './use-mobile-native-chat-proof-image-tiles'

/** Pinch-to-zoom and one-finger pan over one image, starting at fit. Double-tap toggles
 *  fit and 100%; a tap beside the image at fit closes. Zoomed in, full-detail tiles from
 *  the host are drawn over the base image in the same placement. */
export function ProofZoomableImage({
  path,
  uri,
  size,
  label,
  onClose,
  overlay
}: {
  path: string | null
  uri: string
  size: ImageZoomSize
  label: string
  onClose: () => void
  /** Drawn over the image (and its tiles) where the image sits on screen. */
  overlay?: (rect: ProofTileRect) => ReactNode
}): React.JSX.Element {
  const [viewport, setViewport] = useState<ImageZoomSize | null>(null)
  const [image, setImage] = useState<ImageZoomSize>(size)
  // Null means "at fit", so a rotation or a sharper source refits rather than drifting.
  const [view, setView] = useState<ImageZoomView | null>(null)
  const gesture = useRef<ImageViewerGesture | null>(null)
  const lastTap = useRef<ImageViewerTap | null>(null)
  let shown: ImageZoomView | null = null
  if (viewport) {
    shown = view ? clampImageZoomView(view, image, viewport) : imageZoomFitView(image, viewport)
  }
  const { tiles, onTileLoad } = useMobileNativeChatProofImageTiles({
    path,
    view: shown,
    image,
    viewport
  })
  const live = useRef({ image, viewport, shown, onClose })
  live.current = { image, viewport, shown, onClose }

  const responder = useMemo(() => {
    // Relative to this view (its children ignore touches); page coordinates drift when a
    // web page scrolls under the modal.
    const touchesOf = (event: GestureResponderEvent): ImageViewerTouch[] =>
      event.nativeEvent.touches.map((touch) => ({
        x: touch.locationX,
        y: touch.locationY
      }))
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const current = live.current.shown
        if (current) {
          gesture.current = startImageViewerGesture(current, touchesOf(event))
        }
      },
      onPanResponderMove: (event) => {
        const { shown: current, image: size, viewport: area } = live.current
        const active = gesture.current
        const touches = touchesOf(event)
        if (!active || !current || !area || touches.length === 0) {
          return
        }
        if (Math.min(touches.length, 2) !== active.touches.length) {
          gesture.current = startImageViewerGesture(current, touches, active)
          return
        }
        const next = moveImageViewerGesture(active, touches, size, area)
        gesture.current = next.gesture
        setView(next.view)
      },
      onPanResponderRelease: (event) => {
        const active = gesture.current
        gesture.current = null
        const { shown: current, image: size, viewport: area } = live.current
        if (!active || active.moved || !current || !area) {
          lastTap.current = null
          return
        }
        const tap = { at: active.origin, time: event.nativeEvent.timestamp }
        const result = imageViewerTapAction(current, tap, lastTap.current, size, area)
        lastTap.current = result.action === 'none' ? tap : null
        if (result.action === 'toggle') {
          setView(result.view)
        } else if (result.action === 'close') {
          live.current.onClose()
        }
      },
      onPanResponderTerminate: () => {
        gesture.current = null
      }
    })
  }, [])

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout
    setViewport(width > 0 && height > 0 ? { width, height } : null)
  }
  // The full file replaces the thumbnail: keep what is on screen at its new size.
  const onLoad = (event: NativeSyntheticEvent<ImageLoadEventData>): void => {
    const source = event.nativeEvent?.source
    if (!source || !(source.width > 0) || !(source.height > 0)) {
      return
    }
    if (source.width === image.width && source.height === image.height) {
      return
    }
    const next = { width: source.width, height: source.height }
    if (view && viewport) {
      setView(rescaleImageViewForSource(view, image, next, viewport))
    }
    setImage(next)
  }
  const onAction = (event: AccessibilityActionEvent): void => {
    const name = event.nativeEvent.actionName
    if (shown && viewport && (name === 'increment' || name === 'decrement')) {
      const factor = name === 'increment' ? IMAGE_ZOOM_STEP : 1 / IMAGE_ZOOM_STEP
      setView(zoomImageViewBy(shown, factor, image, viewport))
    }
  }
  return (
    <View
      {...responder.panHandlers}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint="Pinch to zoom, double-tap for 100%"
      accessibilityValue={shown ? { text: `${Math.round(shown.scale * 100)}%` } : undefined}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      style={StyleSheet.absoluteFill}
    >
      {shown ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri }}
            onLoad={onLoad}
            resizeMode="stretch"
            style={{
              position: 'absolute',
              left: shown.x,
              top: shown.y,
              width: image.width * shown.scale,
              height: image.height * shown.scale
            }}
          />
          {tiles.map((tile) => {
            const at = proofTilePlacement(tile, proofImageDisplayRect(shown, image))
            return (
              <Image
                key={proofTileKey(tile)}
                testID="proof-image-tile"
                source={{ uri: tile.uri }}
                onLoad={() => onTileLoad(tile)}
                resizeMode="stretch"
                style={{
                  position: 'absolute',
                  left: at.x,
                  top: at.y,
                  width: at.width,
                  height: at.height
                }}
              />
            )
          })}
          {overlay ? overlay(proofImageDisplayRect(shown, image)) : null}
        </View>
      ) : null}
    </View>
  )
}
