import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { Maximize2 } from 'lucide-react-native'
import type { NativeChatProofMedia } from '../../../../src/shared/native-chat-proof-card-payload'
import { colors, spacing } from '../../theme/mobile-theme'
import {
  mobileNativeChatProofAspect,
  mobileNativeChatProofFrame
} from './mobile-native-chat-proof-compare'
import {
  PROOF_MAX_MEDIA_HEIGHT,
  ProofCaption,
  ProofPlaceholder,
  ProofSkeleton,
  proofItemLabel,
  proofStyles
} from './MobileNativeChatProofParts'
import { useMobileNativeChatProofFile } from './use-mobile-native-chat-proof-media'
import {
  mobileNativeChatMediaColumnWidth,
  mobileNativeChatMediaSizeMemory,
  rememberMobileNativeChatMediaColumnWidth
} from '../mobile-native-chat-size-memory'

/** The recording's frame at `width`: its own shape once known (remembered across remounts),
 *  16:10 until then, so the loading block and the player take the same space. */
function videoFrame(path: string, width: number): { width: number; height: number } {
  const size = mobileNativeChatMediaSizeMemory.get(path)
  return mobileNativeChatProofFrame(
    mobileNativeChatProofAspect(size?.width, size?.height),
    width,
    PROOF_MAX_MEDIA_HEIGHT
  )
}

/** Tracks the media column's width, starting from the last one laid out. */
function useColumnWidth(): [number, (event: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(mobileNativeChatMediaColumnWidth)
  return [
    width,
    (event) => {
      const next = event.nativeEvent.layout.width
      rememberMobileNativeChatMediaColumnWidth(next)
      setWidth(next)
    }
  ]
}

/** Plays muted and looped in the card, as on desktop; a tap opens the system full-screen
 *  player with its controls, still muted until Jake turns the sound on. */
function ProofVideoPlayer({
  path,
  uri,
  label
}: {
  path: string
  uri: string
  label: string
}): React.JSX.Element {
  const player = useVideoPlayer(uri, (created) => {
    created.muted = true
    created.loop = true
    created.play()
  })
  const view = useRef<VideoView>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [size, setSize] = useState(() => mobileNativeChatMediaSizeMemory.get(path) ?? null)
  const [maxWidth, onLayout] = useColumnWidth()
  useEffect(() => {
    const keep = (track: { size: { width: number; height: number } } | null | undefined): void => {
      if (track?.size.width && track.size.height) {
        mobileNativeChatMediaSizeMemory.set(path, track.size)
        setSize(track.size)
      }
    }
    const subscriptions = [
      player.addListener('videoTrackChange', ({ videoTrack }) => keep(videoTrack)),
      player.addListener('sourceLoad', ({ availableVideoTracks }) => keep(availableVideoTracks[0]))
    ]
    // The web player only plays videos already mounted, so the setup's play() is too early there.
    player.play()
    return () => {
      for (const subscription of subscriptions) {
        subscription.remove()
      }
    }
  }, [player, path])
  const frame = mobileNativeChatProofFrame(
    mobileNativeChatProofAspect(size?.width, size?.height),
    maxWidth,
    PROOF_MAX_MEDIA_HEIGHT
  )
  const open = (): void => {
    view.current?.enterFullscreen().catch(() => setFullScreen(false))
  }
  return (
    <View onLayout={onLayout}>
      <View style={[proofStyles.frame, styles.videoFrame, frame]}>
        <VideoView
          ref={view}
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={fullScreen}
          fullscreenOptions={{ enable: true }}
          allowsPictureInPicture={false}
          onFullscreenEnter={() => setFullScreen(true)}
          onFullscreenExit={() => setFullScreen(false)}
          accessibilityLabel={label}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${label} full screen`}
          onPress={open}
          style={styles.openArea}
        >
          <View style={[proofStyles.badge, styles.openBadge]}>
            <Maximize2 size={14} color={colors.onAccent} />
          </View>
        </Pressable>
      </View>
    </View>
  )
}

/** A recording from the host's proof folder, downloaded into the phone's cache first. */
export function ProofVideo({ item }: { item: NativeChatProofMedia }): React.JSX.Element {
  const file = useMobileNativeChatProofFile(item.path)
  const [width, onLayout] = useColumnWidth()
  let body: React.JSX.Element
  if (file.status === 'loading') {
    const frame = videoFrame(item.path, width)
    body = (
      <View onLayout={onLayout}>
        <ProofSkeleton
          width={frame.width || '100%'}
          height={frame.height || PROOF_VIDEO_LOADING_HEIGHT}
          received={file.received}
          total={file.total}
        />
      </View>
    )
  } else if (file.status === 'missing') {
    body = <ProofPlaceholder item={item} reason={file.reason} />
  } else {
    body = <ProofVideoPlayer path={item.path} uri={file.value.uri} label={proofItemLabel(item)} />
  }
  return (
    <View>
      {body}
      <ProofCaption item={item} />
    </View>
  )
}

const PROOF_VIDEO_LOADING_HEIGHT = 196

const styles = StyleSheet.create({
  videoFrame: { backgroundColor: colors.bgBase },
  openArea: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: spacing.sm
  },
  openBadge: { position: 'relative', width: 28, height: 28 }
})
