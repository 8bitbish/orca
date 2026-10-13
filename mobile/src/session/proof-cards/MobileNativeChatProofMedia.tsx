import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import {
  nativeChatProofComparePairs,
  type NativeChatProofMedia
} from '../../../../src/shared/native-chat-proof-card-payload'
import { imageThumbnailFrame } from '../../../../src/shared/image-thumbnail-frame'
import { spacing } from '../../theme/mobile-theme'
import { ProofCompare } from './MobileNativeChatProofCompare'
import { ProofImageViewer } from './MobileNativeChatProofImageViewer'
import {
  PROOF_STRIP_HEIGHT,
  PROOF_STRIP_PLACEHOLDER_WIDTH,
  ProofCaption,
  ProofPlaceholder,
  ProofSkeleton,
  proofItemLabel,
  proofKeyed,
  proofStyles
} from './MobileNativeChatProofParts'
import { PROOF_STRIP_BOX, ProofFramedImage, ProofTallCue } from './MobileNativeChatProofThumbnail'
import { ProofVideo } from './MobileNativeChatProofVideo'
import { useMobileNativeChatProofThumbnail } from './use-mobile-native-chat-proof-media'

function rolePrefix(item: NativeChatProofMedia): string | undefined {
  return item.role === 'before' ? 'Before' : item.role === 'after' ? 'After' : undefined
}

/** One screenshot in the strip, in a fixed-size frame; a tap shows it full screen. The
 *  caption wraps to the image's width so tiles stay image-wide; the viewer has it all. */
function ProofImage({ item }: { item: NativeChatProofMedia }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const thumbnail = useMobileNativeChatProofThumbnail(item.path)
  const label = proofItemLabel(item)
  let body: React.JSX.Element
  let width: number = PROOF_STRIP_BOX.minWidth
  if (thumbnail.status === 'loading') {
    body = <ProofSkeleton width={width} height={PROOF_STRIP_HEIGHT} />
  } else if (thumbnail.status === 'missing') {
    width = PROOF_STRIP_PLACEHOLDER_WIDTH
    body = <ProofPlaceholder item={item} reason={thumbnail.reason} inStrip />
  } else {
    const value = thumbnail.value
    const frame = imageThumbnailFrame(value.width, value.height, PROOF_STRIP_BOX)
    width = frame.width
    body = (
      <>
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`${label}, show full size`}
          onPress={() => setOpen(true)}
          style={[proofStyles.frame, { width: frame.width, height: frame.height }]}
        >
          <ProofFramedImage
            src={value.src}
            width={value.width}
            height={value.height}
            frame={frame}
          />
          {frame.tall ? <ProofTallCue /> : null}
        </Pressable>
        {open ? (
          <ProofImageViewer item={item} thumbnail={value} onClose={() => setOpen(false)} />
        ) : null}
      </>
    )
  }
  return (
    <View testID="proof-strip-tile" style={{ width }}>
      {body}
      <ProofCaption item={item} prefix={rolePrefix(item)} lines={2} />
    </View>
  )
}

function ProofStrip({
  items
}: {
  items: readonly NativeChatProofMedia[]
}): React.JSX.Element | null {
  if (items.length === 0) {
    return null
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Screenshots"
      contentContainerStyle={styles.strip}
    >
      {proofKeyed(items, (item) => item.source).map(({ key, item }) => (
        <ProofImage key={key} item={item} />
      ))}
    </ScrollView>
  )
}

/** A proof card's media: recordings first, then a before/after slider for each pair, then
 *  the other screenshots as a swipeable strip. */
export function MobileNativeChatProofViewer({
  media
}: {
  media: readonly NativeChatProofMedia[]
}): React.JSX.Element | null {
  if (media.length === 0) {
    return null
  }
  const pairs = nativeChatProofComparePairs(media)
  const paired = new Set(pairs.flatMap((pair) => [pair.before, pair.after]))
  const videos = media.filter((item) => item.type === 'video')
  const images = media.filter((item) => item.type === 'image' && !paired.has(item))
  return (
    <View style={styles.viewer}>
      {proofKeyed(videos, (item) => item.source).map(({ key, item }) => (
        <ProofVideo key={key} item={item} />
      ))}
      {proofKeyed(pairs, (pair) => `${pair.before.source}|${pair.after.source}`).map(
        ({ key, item: pair }) => (
          <ProofCompare
            key={key}
            before={pair.before}
            after={pair.after}
            fallback={<ProofStrip items={[pair.before, pair.after]} />}
          />
        )
      )}
      <ProofStrip items={images} />
    </View>
  )
}

const styles = StyleSheet.create({
  viewer: { gap: 10 },
  strip: { gap: spacing.sm, paddingBottom: 2 }
})
