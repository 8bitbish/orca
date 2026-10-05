import { Image, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { Maximize2 } from 'lucide-react-native'
import type {
  ImageThumbnailBox,
  ImageThumbnailFrame
} from '../../../../src/shared/image-thumbnail-frame'
import { colors, spacing } from '../../theme/mobile-theme'
import { PROOF_STRIP_HEIGHT, proofStyles } from './MobileNativeChatProofParts'

/** A strip tile: one height, a width that follows the image within these bounds (desktop's). */
export const PROOF_STRIP_BOX: ImageThumbnailBox = {
  height: PROOF_STRIP_HEIGHT,
  minWidth: 128,
  maxWidth: 320
}

/** An image in its fixed frame: whole, or (`fit: 'top'`) filling the width from the top. */
export function ProofFramedImage({
  src,
  width,
  height,
  frame,
  label
}: {
  src: string
  width: number | null
  height: number | null
  frame: Pick<ImageThumbnailFrame, 'width' | 'height' | 'fit'>
  label?: string
}): React.JSX.Element {
  if (frame.fit === 'top' && width && height && width > 0 && height > 0) {
    return (
      <View style={[styles.crop, { width: frame.width, height: frame.height }]}>
        <Image
          accessibilityLabel={label}
          source={{ uri: src }}
          style={{ width: frame.width, height: Math.round((frame.width * height) / width) }}
          resizeMode="stretch"
        />
      </View>
    )
  }
  return (
    <Image
      accessibilityLabel={label}
      source={{ uri: src }}
      style={{ width: frame.width, height: frame.height }}
      resizeMode="contain"
    />
  )
}

/** Fades the bottom of a top-cropped image and says there is more below. */
export function ProofTallCue(): React.JSX.Element {
  return (
    <View pointerEvents="none" style={styles.cue}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="proofTallFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bgBase} stopOpacity={0} />
            <Stop offset="0.5" stopColor={colors.bgBase} stopOpacity={0.6} />
            <Stop offset="1" stopColor={colors.bgBase} stopOpacity={0.95} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#proofTallFade)" />
      </Svg>
      <View style={[proofStyles.pill, styles.cuePill]}>
        <Maximize2 size={11} color={colors.textPrimary} />
        <Text style={styles.cueText}>Tall image, tap to see it all</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  crop: { overflow: 'hidden' },
  cue: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    padding: spacing.sm
  },
  cuePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cueText: { color: colors.textPrimary, fontSize: 11, fontWeight: '500' }
})
