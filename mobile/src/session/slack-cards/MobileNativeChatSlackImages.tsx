import { useContext, useEffect, useState } from 'react'
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { X } from 'lucide-react-native'
import type { NativeChatSlackImage } from '../../../../src/shared/native-chat-slack-card-payload'
import type {
  NativeChatSlackImageResult,
  NativeChatSlackImageVariant
} from '../../../../src/shared/native-chat-slack-image-contract'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import { MobileNativeChatSlackContext } from './mobile-native-chat-slack-context'

const THUMB_HEIGHT = 96
const MAX_THUMB_WIDTH = 180

/** undefined while loading, null when the host gave no image. */
function useSlackImage(
  path: string | null,
  variant: NativeChatSlackImageVariant
): NativeChatSlackImageResult | null | undefined {
  const slack = useContext(MobileNativeChatSlackContext)
  const [image, setImage] = useState<NativeChatSlackImageResult | null | undefined>(undefined)
  useEffect(() => {
    if (path === null) {
      return
    }
    if (!slack) {
      setImage(null)
      return
    }
    let cancelled = false
    setImage(undefined)
    void slack.loadImage(path, variant).then((loaded) => {
      if (!cancelled) {
        setImage(loaded)
      }
    })
    return () => {
      cancelled = true
    }
  }, [path, slack, variant])
  return image
}

function thumbWidth(
  image: NativeChatSlackImage,
  loaded: NativeChatSlackImageResult | undefined
): number {
  const width = loaded?.width ?? image.width
  const height = loaded?.height ?? image.height
  if (!width || !height) {
    return THUMB_HEIGHT
  }
  return Math.round(Math.min(MAX_THUMB_WIDTH, Math.max(48, (THUMB_HEIGHT * width) / height)))
}

function Thumbnail({
  image,
  onOpen
}: {
  image: NativeChatSlackImage
  onOpen: (thumbnail: NativeChatSlackImageResult) => void
}): React.JSX.Element | null {
  const loaded = useSlackImage(image.path, 'thumbnail')
  // A missing, refused or unreadable image is left out.
  if (loaded === null) {
    return null
  }
  const width = thumbWidth(image, loaded)
  const label = image.name ?? 'Slack image'
  if (loaded === undefined) {
    return <View accessibilityLabel={`${label}, loading`} style={[styles.thumb, { width }]} />
  }
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`${label}, show full size`}
      onPress={() => onOpen(loaded)}
    >
      <Image source={{ uri: loaded.src }} style={[styles.thumb, { width }]} resizeMode="cover" />
    </Pressable>
  )
}

function FullSize({
  image,
  thumbnail,
  onClose
}: {
  image: NativeChatSlackImage
  thumbnail: NativeChatSlackImageResult
  onClose: () => void
}): React.JSX.Element {
  const full = useSlackImage(image.path, 'full')
  const shown = full ?? thumbnail
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close image" onPress={onClose} style={styles.backdrop}>
        <Image
          accessibilityLabel={image.name ?? 'Slack image'}
          source={{ uri: shown.src }}
          style={styles.full}
          resizeMode="contain"
        />
        {image.name ? (
          <Text style={styles.caption} numberOfLines={1}>
            {image.name}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={12}
        onPress={onClose}
        style={styles.close}
      >
        <X size={20} color={colors.textPrimary} />
      </Pressable>
    </Modal>
  )
}

/** Keys from the path, counted so a card naming one file twice still keys uniquely. */
function keyedImages(
  images: readonly NativeChatSlackImage[]
): { key: string; image: NativeChatSlackImage; index: number }[] {
  const seen = new Map<string, number>()
  return images.map((image, index) => {
    const count = seen.get(image.path) ?? 0
    seen.set(image.path, count + 1)
    return { key: `${image.path}#${count}`, image, index }
  })
}

/** A Slack card's images as thumbnails from the chat's host; a tap opens one full size. */
export function MobileNativeChatSlackImages({
  images
}: {
  images: readonly NativeChatSlackImage[]
}): React.JSX.Element | null {
  const [open, setOpen] = useState<{ index: number; thumbnail: NativeChatSlackImageResult } | null>(
    null
  )
  if (images.length === 0) {
    return null
  }
  const opened = open === null ? undefined : images[open.index]
  return (
    <View style={styles.row}>
      {keyedImages(images).map(({ key, image, index }) => (
        <Thumbnail key={key} image={image} onOpen={(thumbnail) => setOpen({ index, thumbnail })} />
      ))}
      {open && opened ? (
        <FullSize image={opened} thumbnail={open.thumbnail} onClose={() => setOpen(null)} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: {
    height: THUMB_HEIGHT,
    borderRadius: radii.row,
    backgroundColor: colors.bgPanel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm
  },
  full: { width: '100%', flex: 1 },
  caption: { color: colors.textSecondary, fontSize: typography.metaSize },
  close: {
    position: 'absolute',
    top: spacing.xl * 2,
    right: spacing.lg,
    backgroundColor: colors.bgRaised,
    borderRadius: 999,
    padding: spacing.sm
  }
})
