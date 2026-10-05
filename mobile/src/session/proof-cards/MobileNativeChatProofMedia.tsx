import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import {
  nativeChatProofComparePair,
  type NativeChatProofMedia
} from '../../../../src/shared/native-chat-proof-card-payload'
import { imageThumbnailFrame } from '../../../../src/shared/image-thumbnail-frame'
import { spacing } from '../../theme/mobile-theme'
import { ProofCompare } from './MobileNativeChatProofCompare'
import { ProofImageViewer } from './MobileNativeChatProofImageViewer'
import {
  PROOF_STRIP_HEIGHT,
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

/** One screenshot in the strip, in a fixed-size frame; a tap shows it full screen. */
function ProofImage({ item }: { item: NativeChatProofMedia }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const thumbnail = useMobileNativeChatProofThumbnail(item.path)
  const label = proofItemLabel(item)
  let body: React.JSX.Element
  if (item.path === null) {
    body = <ProofPlaceholder item={item} reason="outside-folder" inStrip />
  } else if (thumbnail.status === 'loading') {
    body = <ProofSkeleton width={PROOF_STRIP_BOX.minWidth} height={PROOF_STRIP_HEIGHT} />
  } else if (thumbnail.status === 'missing') {
    body = <ProofPlaceholder item={item} reason={thumbnail.reason} inStrip />
  } else {
    const value = thumbnail.value
    const frame = imageThumbnailFrame(value.width, value.height, PROOF_STRIP_BOX)
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
    <View style={styles.tile}>
      {body}
      <ProofCaption item={item} prefix={rolePrefix(item)} />
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

/** A proof card's media: recordings first, then a before/after slider when the card has
 *  exactly one of each, then the other screenshots as a swipeable strip. */
export function MobileNativeChatProofViewer({
  media
}: {
  media: readonly NativeChatProofMedia[]
}): React.JSX.Element | null {
  if (media.length === 0) {
    return null
  }
  const pair = nativeChatProofComparePair(media)
  const videos = media.filter((item) => item.type === 'video')
  const images = media.filter(
    (item) => item.type === 'image' && item !== pair?.before && item !== pair?.after
  )
  return (
    <View style={styles.viewer}>
      {proofKeyed(videos, (item) => item.source).map(({ key, item }) => (
        <ProofVideo key={key} item={item} />
      ))}
      {pair ? (
        <ProofCompare
          before={pair.before}
          after={pair.after}
          fallback={<ProofStrip items={[pair.before, pair.after]} />}
        />
      ) : null}
      <ProofStrip items={images} />
    </View>
  )
}

const styles = StyleSheet.create({
  viewer: { gap: 10 },
  strip: { gap: spacing.sm, paddingBottom: 2 },
  tile: { maxWidth: PROOF_STRIP_BOX.maxWidth }
})
