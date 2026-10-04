import { useMemo, useRef, useState } from 'react'
import {
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent
} from 'react-native'
import { ChevronsLeftRight } from 'lucide-react-native'
import type { NativeChatProofMedia } from '../../../../src/shared/native-chat-proof-card-payload'
import { colors, spacing } from '../../theme/mobile-theme'
import {
  MOBILE_NATIVE_CHAT_PROOF_COMPARE_START,
  mobileNativeChatProofAspect,
  mobileNativeChatProofComparePosition,
  mobileNativeChatProofFrame,
  stepMobileNativeChatProofComparePosition
} from './mobile-native-chat-proof-compare'
import {
  PROOF_MAX_MEDIA_HEIGHT,
  ProofCaption,
  ProofSkeleton,
  proofItemLabel,
  proofStyles
} from './MobileNativeChatProofParts'
import { useMobileNativeChatProofThumbnail } from './use-mobile-native-chat-proof-media'

const HANDLE = 28

/** Before over after, split by a divider dragged across the frame. The host's 1024 px
 *  renditions are sharp enough at card width. `fallback` shows if either cannot load. */
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
  const [maxWidth, setMaxWidth] = useState(0)
  const width = useRef(0)
  const grantX = useRef(0)
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Horizontal drags are the slider's; vertical ones still scroll the chat.
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          grantX.current = event.nativeEvent.locationX
          setPosition(mobileNativeChatProofComparePosition(grantX.current, width.current))
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
  const aspect =
    afterImage.status === 'ready'
      ? mobileNativeChatProofAspect(afterImage.value.width, afterImage.value.height)
      : mobileNativeChatProofAspect()
  const frame = mobileNativeChatProofFrame(aspect, maxWidth, PROOF_MAX_MEDIA_HEIGHT)
  const onAction = (event: AccessibilityActionEvent): void => {
    const name = event.nativeEvent.actionName
    if (name === 'increment' || name === 'decrement') {
      setPosition((current) => stepMobileNativeChatProofComparePosition(current, name))
    }
  }
  return (
    <View onLayout={(event: LayoutChangeEvent) => setMaxWidth(event.nativeEvent.layout.width)}>
      {beforeImage.status !== 'ready' || afterImage.status !== 'ready' ? (
        <ProofSkeleton width="100%" height={frame.height || 196} />
      ) : (
        <View
          {...responder.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to compare before and after"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(position) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onAction}
          onLayout={(event: LayoutChangeEvent) => {
            width.current = event.nativeEvent.layout.width
          }}
          style={[proofStyles.frame, frame]}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Image
              accessibilityLabel={`After: ${proofItemLabel(after)}`}
              source={{ uri: afterImage.value.src }}
              style={frame}
              resizeMode="contain"
            />
            <View style={[styles.beforeClip, { width: `${position}%` }]}>
              <Image
                accessibilityLabel={`Before: ${proofItemLabel(before)}`}
                source={{ uri: beforeImage.value.src }}
                style={frame}
                resizeMode="contain"
              />
            </View>
            <View style={[styles.divider, { left: `${position}%` }]}>
              <View style={styles.handle}>
                <ChevronsLeftRight size={16} color={colors.textPrimary} />
              </View>
            </View>
            <Text style={[proofStyles.label, styles.beforeLabel]}>Before</Text>
            <Text style={[proofStyles.label, styles.afterLabel]}>After</Text>
          </View>
        </View>
      )}
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
  afterLabel: { right: spacing.sm }
})
