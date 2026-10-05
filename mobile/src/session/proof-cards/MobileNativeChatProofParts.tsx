import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { ImageOff, VideoOff } from 'lucide-react-native'
import type { NativeChatProofMedia } from '../../../../src/shared/native-chat-proof-card-payload'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import type { MobileNativeChatProofMediaRefusal } from './mobile-native-chat-proof-media-loader'

export const PROOF_STRIP_HEIGHT = 176
export const PROOF_MAX_MEDIA_HEIGHT = 400

export function proofBasename(source: string): string {
  const trimmed = source.replace(/[\\/]+$/, '')
  return trimmed.slice(Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1) || source
}

/** Keys from each item's identity, counted so a card naming one thing twice still keys uniquely. */
export function proofKeyed<T>(
  items: readonly T[],
  identity: (item: T) => string
): { key: string; item: T }[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const id = identity(item)
    const count = seen.get(id) ?? 0
    seen.set(id, count + 1)
    return { key: `${id}#${count}`, item }
  })
}

export function proofItemLabel(item: NativeChatProofMedia): string {
  return item.caption ?? proofBasename(item.source)
}

/** What went wrong, in the desktop card's words where it has them. */
export function mobileNativeChatProofPlaceholderTitle(
  type: NativeChatProofMedia['type'],
  reason: MobileNativeChatProofMediaRefusal
): string {
  const video = type === 'video'
  switch (reason) {
    case 'missing':
      return video ? 'Recording not found' : 'Screenshot not found'
    case 'outside-folder':
    case 'invalid-path':
      return 'Not in the proof folder'
    case 'folder-missing':
      return 'No proof folder on the Mac'
    case 'too-large':
      return 'Too large to show'
    case 'wrong-type':
      return video ? 'Not a video file' : 'Not an image file'
    case 'changed':
      return 'The file changed on the Mac'
    case 'bad-range':
    case 'unavailable':
      return 'Media unavailable'
  }
}

/** A clear stand-in for media that cannot be shown: what went wrong, and which file. */
export function ProofPlaceholder({
  item,
  reason,
  inStrip = false
}: {
  item: NativeChatProofMedia
  reason: MobileNativeChatProofMediaRefusal
  inStrip?: boolean
}): React.JSX.Element {
  const Icon = item.type === 'video' ? VideoOff : ImageOff
  const title = mobileNativeChatProofPlaceholderTitle(item.type, reason)
  return (
    <View
      accessibilityLabel={`${title}: ${proofBasename(item.source)}`}
      style={[styles.placeholder, inStrip ? styles.placeholderStrip : null]}
    >
      <Icon size={16} color={colors.textSecondary} />
      <View style={styles.flex}>
        <Text style={styles.placeholderTitle}>{title}</Text>
        <Text style={styles.placeholderFile} numberOfLines={1}>
          {proofBasename(item.source)}
        </Text>
      </View>
    </View>
  )
}

export function ProofCaption({
  item,
  prefix
}: {
  item: NativeChatProofMedia
  prefix?: string
}): React.JSX.Element | null {
  const parts = [prefix, item.caption, item.where].filter(Boolean)
  return parts.length === 0 ? null : (
    <Text style={styles.caption} numberOfLines={1}>
      {parts.join(' · ')}
    </Text>
  )
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

/** A pulsing block while media loads, with how much of a download has arrived. */
export function ProofSkeleton({
  width,
  height,
  received,
  total
}: {
  width: number | `${number}%`
  height: number
  received?: number
  total?: number
}): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true })
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  const progress = total ? `${megabytes(received ?? 0)} of ${megabytes(total)} MB` : null
  return (
    <View
      accessibilityLabel={progress ? `Loading, ${progress}` : 'Loading'}
      style={{ width, height }}
    >
      <Animated.View style={[styles.skeleton, { opacity: pulse }]} />
      {progress ? (
        <View style={styles.progressOverlay}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(((received ?? 0) / (total ?? 1)) * 100)}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progress}</Text>
        </View>
      ) : null}
    </View>
  )
}

export const proofStyles = StyleSheet.create({
  frame: {
    borderRadius: radii.row,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
    overflow: 'hidden'
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.row,
    backgroundColor: 'rgba(0, 0, 0, 0.55)'
  },
  pill: {
    borderRadius: 4,
    backgroundColor: 'rgba(17, 17, 17, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  label: {
    position: 'absolute',
    top: spacing.sm,
    borderRadius: 4,
    backgroundColor: 'rgba(17, 17, 17, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '500'
  }
})

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  placeholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 80,
    borderRadius: radii.row,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
    paddingHorizontal: spacing.md
  },
  placeholderStrip: { height: PROOF_STRIP_HEIGHT, width: 224 },
  placeholderTitle: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '500' },
  placeholderFile: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: typography.monoFamily
  },
  caption: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.row,
    backgroundColor: colors.bgPanel
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.xl
  },
  progressTrack: {
    alignSelf: 'stretch',
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    overflow: 'hidden'
  },
  progressFill: { height: 3, backgroundColor: colors.textSecondary },
  progressText: { color: colors.textSecondary, fontSize: 11 }
})
