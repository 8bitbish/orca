import { useMemo, useRef, useState } from 'react'
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type ImageLoadEventData,
  type LayoutChangeEvent,
  type NativeSyntheticEvent
} from 'react-native'
import { X } from 'lucide-react-native'
import {
  IMAGE_ZOOM_STEP,
  clampImageZoomView,
  imageZoomFitView,
  rescaleImageViewForSource,
  zoomImageViewBy,
  type ImageZoomSize,
  type ImageZoomView
} from '../../../../src/shared/image-zoom-pan'
import type { NativeChatProofMedia } from '../../../../src/shared/native-chat-proof-card-payload'
import { colors, radii, spacing } from '../../theme/mobile-theme'
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
  proofTilePlacement
} from './mobile-native-chat-proof-image-tiles'
import { proofItemLabel, proofStyles } from './MobileNativeChatProofParts'
import { useMobileNativeChatProofImageTiles } from './use-mobile-native-chat-proof-image-tiles'
import { useMobileNativeChatProofFile } from './use-mobile-native-chat-proof-media'

export type ProofViewerSide = 'before' | 'after'

type Thumbnail = { src: string; width: number | null; height: number | null }
/** Until the image reports its size, it is laid out as 16:10. */
const UNKNOWN_SIZE = { width: 1600, height: 1000 }

/** Pinch-to-zoom and one-finger pan over one image, starting at fit. Double-tap toggles
 *  fit and 100%; a tap beside the image at fit closes. Zoomed in, full-detail tiles from
 *  the host are drawn over the base image in the same placement. */
function ZoomableImage({
  path,
  uri,
  size,
  label,
  onClose
}: {
  path: string | null
  uri: string
  size: ImageZoomSize
  label: string
  onClose: () => void
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
        </View>
      ) : null}
    </View>
  )
}

/** A screenshot full screen, from its thumbnail until the full file is in the phone's
 *  cache. Closes with the X, Android's back button or a tap beside the image. */
export function ProofImageViewer({
  item,
  thumbnail,
  onClose,
  side
}: {
  item: NativeChatProofMedia
  thumbnail: Thumbnail
  onClose: () => void
  /** Opened from the before/after slider: which side shows, and how to switch. */
  side?: { current: ProofViewerSide; onChange: (side: ProofViewerSide) => void }
}): React.JSX.Element {
  const full = useMobileNativeChatProofFile(item.path)
  const uri = full.status === 'ready' ? full.value.uri : thumbnail.src
  const prefix = side ? `${side.current === 'before' ? 'Before' : 'After'}: ` : ''
  const label = `${prefix}${proofItemLabel(item)}`
  const size =
    thumbnail.width && thumbnail.height
      ? { width: thumbnail.width, height: thumbnail.height }
      : UNKNOWN_SIZE
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ZoomableImage
          key={item.path}
          path={item.path}
          uri={uri}
          size={size}
          label={label}
          onClose={onClose}
        />
        <View pointerEvents="box-none" style={styles.top}>
          {side ? (
            <View accessibilityRole="tablist" style={styles.sides}>
              {(['before', 'after'] as const).map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: side.current === name }}
                  onPress={() => side.onChange(name)}
                  style={[styles.side, side.current === name ? styles.sideOn : null]}
                >
                  <Text style={styles.sideText}>{name === 'before' ? 'Before' : 'After'}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={onClose}
            style={styles.close}
          >
            <X size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View pointerEvents="none" style={styles.captionRow}>
          <Text style={[proofStyles.pill, styles.caption]} numberOfLines={1}>
            {full.status === 'loading' ? `${label} · loading full size` : label}
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.bgBase },
  top: {
    position: 'absolute',
    top: spacing.xl * 2,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sides: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: radii.button,
    backgroundColor: colors.bgPanel
  },
  side: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.button - 2 },
  sideOn: { backgroundColor: colors.bgRaised },
  sideText: { color: colors.textPrimary, fontSize: 13, fontWeight: '500' },
  close: { backgroundColor: colors.bgRaised, borderRadius: 999, padding: spacing.sm },
  captionRow: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl * 2,
    alignItems: 'center'
  },
  caption: { color: colors.textPrimary, fontSize: 11, maxWidth: '100%' }
})
