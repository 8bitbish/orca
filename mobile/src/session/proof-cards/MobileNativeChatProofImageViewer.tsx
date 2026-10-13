import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent
} from 'react-native'
import { ChevronsLeftRight, X } from 'lucide-react-native'
import type { NativeChatProofMedia } from '../../../../src/shared/native-chat-proof-card-payload'
import { colors, radii, spacing } from '../../theme/mobile-theme'
import {
  MOBILE_NATIVE_CHAT_PROOF_COMPARE_START,
  mobileNativeChatProofComparePosition,
  stepMobileNativeChatProofComparePosition
} from './mobile-native-chat-proof-compare'
import type { ProofTileRect } from './mobile-native-chat-proof-image-tiles'
import { proofItemLabel, proofStyles } from './MobileNativeChatProofParts'
import { ProofZoomableImage } from './MobileNativeChatProofZoomableImage'
import { useMobileNativeChatProofFile } from './use-mobile-native-chat-proof-media'

export type ProofViewerMode = 'before' | 'compare' | 'after'

type Thumbnail = { src: string; width: number | null; height: number | null }
export type ProofViewerShot = { item: NativeChatProofMedia; thumbnail: Thumbnail }

/** Until the image reports its size, it is laid out as 16:10. */
const UNKNOWN_SIZE = { width: 1600, height: 1000 }
const HANDLE = 32
/** The divider's touch target, wider than the line so a thumb finds it. */
const HANDLE_HIT = 48
const MODES: readonly { mode: ProofViewerMode; label: string }[] = [
  { mode: 'before', label: 'Before' },
  { mode: 'compare', label: 'Compare' },
  { mode: 'after', label: 'After' }
]

function sizeOf(thumbnail: Thumbnail): { width: number; height: number } {
  return thumbnail.width && thumbnail.height
    ? { width: thumbnail.width, height: thumbnail.height }
    : UNKNOWN_SIZE
}

/** The full-screen frame: the image, a close button, optional tabs and a caption. */
function ViewerFrame({
  caption,
  tabs,
  onClose,
  onLayout,
  children
}: {
  caption: string
  tabs?: ReactNode
  onClose: () => void
  onLayout?: (event: LayoutChangeEvent) => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop} onLayout={onLayout}>
        {children}
        <View pointerEvents="box-none" style={styles.top}>
          {tabs ?? <View />}
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
          <Text style={[proofStyles.pill, styles.caption]} numberOfLines={3}>
            {caption}
          </Text>
        </View>
      </View>
    </Modal>
  )
}

/** A screenshot full screen, from its thumbnail until the full file is in the phone's
 *  cache. Closes with the X, Android's back button or a tap beside the image. */
export function ProofImageViewer({
  item,
  thumbnail,
  onClose
}: ProofViewerShot & { onClose: () => void }): React.JSX.Element {
  const full = useMobileNativeChatProofFile(item.path)
  const label = proofItemLabel(item)
  return (
    <ViewerFrame
      caption={full.status === 'loading' ? `${label} · loading full size` : label}
      onClose={onClose}
    >
      <ProofZoomableImage
        key={item.path}
        path={item.path}
        uri={full.status === 'ready' ? full.value.uri : thumbnail.src}
        size={sizeOf(thumbnail)}
        label={label}
        onClose={onClose}
      />
    </ViewerFrame>
  )
}

/** The divider over the full-screen pair: drag it, or step it with a screen reader. */
function CompareDivider({
  position,
  width,
  onChange
}: {
  position: number
  width: number
  onChange: (position: number) => void
}): React.JSX.Element {
  const live = useRef({ position, width, onChange, start: 0 })
  live.current = { ...live.current, position, width, onChange }
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const current = live.current
          current.start = (current.position / 100) * current.width
        },
        onPanResponderMove: (_event, gesture) => {
          const current = live.current
          current.onChange(
            mobileNativeChatProofComparePosition(current.start + gesture.dx, current.width)
          )
        }
      }),
    []
  )
  const onAction = (event: AccessibilityActionEvent): void => {
    const name = event.nativeEvent.actionName
    if (name === 'increment' || name === 'decrement') {
      onChange(stepMobileNativeChatProofComparePosition(position, name))
    }
  }
  return (
    <View
      {...responder.panHandlers}
      testID="proof-viewer-divider"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Drag to compare before and after"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(position) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      style={[styles.divider, { left: (position / 100) * width - HANDLE_HIT / 2 }]}
    >
      <View pointerEvents="none" style={styles.dividerLine} />
      <View pointerEvents="none" style={styles.handle}>
        <ChevronsLeftRight size={18} color={colors.textPrimary} />
      </View>
    </View>
  )
}

/** A before/after pair full screen, opening on the slider: after underneath, before clipped
 *  to the divider, both zooming and panning together. Before and After show either alone. */
export function ProofCompareViewer({
  before,
  after,
  initial = 'compare',
  onClose
}: {
  before: ProofViewerShot
  after: ProofViewerShot
  initial?: ProofViewerMode
  onClose: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState<ProofViewerMode>(initial)
  const [position, setPosition] = useState(MOBILE_NATIVE_CHAT_PROOF_COMPARE_START)
  const [width, setWidth] = useState(0)
  const beforeFull = useMobileNativeChatProofFile(before.item.path)
  const afterFull = useMobileNativeChatProofFile(after.item.path)
  const uriOf = (shot: ProofViewerShot, full: typeof beforeFull): string =>
    full.status === 'ready' ? full.value.uri : shot.thumbnail.src
  const base = mode === 'before' ? before : after
  const baseFull = mode === 'before' ? beforeFull : afterFull
  const beforeLabel = `Before: ${proofItemLabel(before.item)}`
  const afterLabel = `After: ${proofItemLabel(after.item)}`
  const label =
    mode === 'compare'
      ? `${beforeLabel} · ${afterLabel}`
      : mode === 'before'
        ? beforeLabel
        : afterLabel
  const loading =
    baseFull.status === 'loading' || (mode === 'compare' && beforeFull.status === 'loading')
  const beforeUri = uriOf(before, beforeFull)
  const overlay =
    mode === 'compare'
      ? (rect: ProofTileRect) => (
          <View
            testID="proof-viewer-before-clip"
            style={[styles.beforeClip, { width: (position / 100) * width }]}
          >
            <Image
              accessibilityLabel={beforeLabel}
              source={{ uri: beforeUri }}
              resizeMode="contain"
              style={{
                position: 'absolute',
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height
              }}
            />
          </View>
        )
      : undefined
  const tabs = (
    <View accessibilityRole="tablist" style={styles.sides}>
      {MODES.map(({ mode: name, label: text }) => (
        <Pressable
          key={name}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === name }}
          onPress={() => setMode(name)}
          style={[styles.side, mode === name ? styles.sideOn : null]}
        >
          <Text style={styles.sideText}>{text}</Text>
        </Pressable>
      ))}
    </View>
  )
  return (
    <ViewerFrame
      caption={loading ? `${label} · loading full size` : label}
      tabs={tabs}
      onClose={onClose}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {/* Keyed by the base image, so Compare and After share one zoom. */}
      <ProofZoomableImage
        key={base.item.path}
        path={base.item.path}
        uri={uriOf(base, baseFull)}
        size={sizeOf(base.thumbnail)}
        label={mode === 'compare' ? `Before and after: ${proofItemLabel(after.item)}` : label}
        onClose={onClose}
        overlay={overlay}
      />
      {mode === 'compare' && width > 0 ? (
        <>
          <Text style={[proofStyles.label, styles.compareLabel, styles.beforeTag]}>Before</Text>
          <Text style={[proofStyles.label, styles.compareLabel, styles.afterTag]}>After</Text>
          <CompareDivider position={position} width={width} onChange={setPosition} />
        </>
      ) : null}
    </ViewerFrame>
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
  caption: { color: colors.textPrimary, fontSize: 11, maxWidth: '100%' },
  beforeClip: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dividerLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: HANDLE_HIT / 2 - 1,
    width: 2,
    backgroundColor: colors.textPrimary
  },
  handle: {
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center'
  },
  compareLabel: { top: spacing.xl * 2 + 52 },
  beforeTag: { left: spacing.lg },
  afterTag: { right: spacing.lg }
})
