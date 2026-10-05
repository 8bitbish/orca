import { useMemo, useRef, useState } from 'react'
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent
} from 'react-native'
import { ChevronsLeftRight, Maximize2 } from 'lucide-react-native'
import { imageThumbnailFrame, isTallImage } from '../../../../src/shared/image-thumbnail-frame'
import type { NativeChatProofMedia } from '../../../../src/shared/native-chat-proof-card-payload'
import { colors, spacing } from '../../theme/mobile-theme'
import {
  MOBILE_NATIVE_CHAT_PROOF_COMPARE_START,
  mobileNativeChatProofCompareBox,
  mobileNativeChatProofCompareClaimsDrag,
  mobileNativeChatProofComparePosition,
  mobileNativeChatProofCompareTapSide,
  mobileNativeChatProofPressX,
  stepMobileNativeChatProofComparePosition
} from './mobile-native-chat-proof-compare'
import { ProofImageViewer, type ProofViewerSide } from './MobileNativeChatProofImageViewer'
import {
  ProofCaption,
  ProofSkeleton,
  proofItemLabel,
  proofStyles
} from './MobileNativeChatProofParts'
import { ProofFramedImage, ProofTallCue } from './MobileNativeChatProofThumbnail'
import { useMobileNativeChatProofThumbnail } from './use-mobile-native-chat-proof-media'

const HANDLE = 28

/** Before over after, split by a divider dragged across a fixed frame. A tap that does not
 *  drag opens the side it landed on full screen. `fallback` shows if either cannot load. */
export function ProofCompare({
  before,
  after,
  fallback
}: {
  before: NativeChatProofMedia
  after: NativeChatProofMedia
  fallback: React.JSX.Element
}): React.JSX.Element {
  const beforeImage = useMobileNativeChatProofThumbnail(before.path)
  const afterImage = useMobileNativeChatProofThumbnail(after.path)
  const [position, setPosition] = useState(MOBILE_NATIVE_CHAT_PROOF_COMPARE_START)
  const [openSide, setOpenSide] = useState<ProofViewerSide | null>(null)
  const [cardWidth, setCardWidth] = useState(0)
  const width = useRef(0)
  const grantX = useRef(0)
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Claimed only once a drag turns horizontal: claiming on touch start (and refusing
        // to let go) froze chat scrolling over the slider and jumped the divider on a scroll.
        // Claiming it cancels the tap underneath, so a drag never opens the viewer.
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          mobileNativeChatProofCompareClaimsDrag(gesture.dx, gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event, gesture) => {
          const x = event.nativeEvent.locationX
          grantX.current = x - gesture.dx
          setPosition(mobileNativeChatProofComparePosition(x, width.current))
        },
        onPanResponderMove: (_event, gesture) =>
          setPosition(
            mobileNativeChatProofComparePosition(grantX.current + gesture.dx, width.current)
          )
      }),
    []
  )
  if (
    before.path === null ||
    after.path === null ||
    beforeImage.status === 'missing' ||
    afterImage.status === 'missing'
  ) {
    return fallback
  }
  const box = mobileNativeChatProofCompareBox(cardWidth)
  const onAction = (event: AccessibilityActionEvent): void => {
    const name = event.nativeEvent.actionName
    if (name === 'increment' || name === 'decrement') {
      setPosition((current) => stepMobileNativeChatProofComparePosition(current, name))
    } else if (name === 'activate') {
      setOpenSide('after')
    }
  }
  let body: React.JSX.Element
  if (beforeImage.status !== 'ready' || afterImage.status !== 'ready' || !(cardWidth > 0)) {
    body = <ProofSkeleton width="100%" height={box.height} />
  } else {
    const beforeValue = beforeImage.value
    const afterValue = afterImage.value
    const frame = imageThumbnailFrame(afterValue.width, afterValue.height, box)
    const tall = frame.tall || isTallImage(beforeValue.width, beforeValue.height)
    const fitted = {
      width: frame.width,
      height: frame.height,
      fit: tall ? 'top' : 'contain'
    } as const
    body = (
      <View style={{ width: frame.width, height: frame.height }}>
        <View
          {...responder.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to compare before and after"
          accessibilityHint="Double-tap to view full screen"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(position) }}
          accessibilityActions={[
            { name: 'increment' },
            { name: 'decrement' },
            { name: 'activate' }
          ]}
          onAccessibilityAction={onAction}
          onLayout={(event: LayoutChangeEvent) => {
            width.current = event.nativeEvent.layout.width
          }}
          style={[proofStyles.frame, StyleSheet.absoluteFill]}
        >
          <Pressable
            testID="proof-compare-tap"
            onPress={(event) => {
              const x = mobileNativeChatProofPressX(event.nativeEvent)
              setOpenSide(mobileNativeChatProofCompareTapSide(x, width.current, position))
            }}
            style={StyleSheet.absoluteFill}
          >
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <ProofFramedImage
                src={afterValue.src}
                width={afterValue.width}
                height={afterValue.height}
                frame={fitted}
                label={`After: ${proofItemLabel(after)}`}
              />
              <View style={[styles.beforeClip, { width: `${position}%` }]}>
                <ProofFramedImage
                  src={beforeValue.src}
                  width={beforeValue.width}
                  height={beforeValue.height}
                  frame={fitted}
                  label={`Before: ${proofItemLabel(before)}`}
                />
              </View>
              {tall ? <ProofTallCue /> : null}
              <View style={[styles.divider, { left: `${position}%` }]}>
                <View style={styles.handle}>
                  <ChevronsLeftRight size={16} color={colors.textPrimary} />
                </View>
              </View>
              <Text style={[proofStyles.label, styles.beforeLabel]}>Before</Text>
              <Text style={[proofStyles.label, styles.afterLabel]}>After</Text>
            </View>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View before and after full screen"
          hitSlop={8}
          onPress={() => setOpenSide('after')}
          style={[proofStyles.badge, styles.expand]}
        >
          <Maximize2 size={14} color={colors.onAccent} />
        </Pressable>
        {openSide ? (
          <ProofImageViewer
            item={openSide === 'before' ? before : after}
            thumbnail={openSide === 'before' ? beforeValue : afterValue}
            onClose={() => setOpenSide(null)}
            side={{ current: openSide, onChange: setOpenSide }}
          />
        ) : null}
      </View>
    )
  }
  return (
    <View onLayout={(event: LayoutChangeEvent) => setCardWidth(event.nativeEvent.layout.width)}>
      {body}
      <ProofCaption item={before} prefix="Before" />
      <ProofCaption item={after} prefix="After" />
    </View>
  )
}

const styles = StyleSheet.create({
  beforeClip: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center'
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
  beforeLabel: { left: spacing.sm },
  afterLabel: { right: spacing.sm },
  expand: { right: spacing.sm, bottom: spacing.sm, width: 28, height: 28 }
})
