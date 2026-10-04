import { useEffect, useRef, useState } from 'react'
import { ChevronsLeftRight, ImageOff, Maximize2, VideoOff } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import {
  nativeChatProofComparePair,
  type NativeChatProofMedia
} from '../../../../shared/native-chat-proof-card-payload'
import type { NativeChatProofMediaRefusal } from '../../../../shared/native-chat-proof-media-contract'
import { NativeChatImagePreviewDialog } from './NativeChatImagePreviewDialog'
import { useNativeChatProofImage, useNativeChatProofVideo } from './use-native-chat-proof-media'

function itemLabel(item: NativeChatProofMedia): string {
  return item.caption ?? basename(item.source)
}

function placeholderTitle(item: NativeChatProofMedia, reason: NativeChatProofMediaRefusal): string {
  const video = item.type === 'video'
  switch (reason) {
    case 'missing':
      return video
        ? translate('components.native-chat.proof.videoMissing', 'Recording not found')
        : translate('components.native-chat.proof.imageMissing', 'Screenshot not found')
    case 'outside-folder':
    case 'invalid-path':
      return translate('components.native-chat.proof.outsideFolder', 'Not in the proof folder')
    case 'folder-missing':
      return translate('components.native-chat.proof.folderMissing', 'No proof folder on this Mac')
    case 'too-large':
      return translate('components.native-chat.proof.tooLarge', 'Too large to show')
    case 'wrong-type':
      return video
        ? translate('components.native-chat.proof.notVideo', 'Not a video file')
        : translate('components.native-chat.proof.notImage', 'Not an image file')
    case 'unavailable':
      return translate('components.native-chat.proof.unavailable', 'Can’t show this file here')
  }
}

/** A clear stand-in for media that cannot be shown: what went wrong, and which file. */
function ProofPlaceholder({
  item,
  reason,
  inStrip = false
}: {
  item: NativeChatProofMedia
  reason: NativeChatProofMediaRefusal
  /** Strip tiles keep the strip's height and a fixed width. */
  inStrip?: boolean
}): React.JSX.Element {
  const Icon = item.type === 'video' ? VideoOff : ImageOff
  return (
    <div
      data-proof-media-missing={reason}
      title={item.source}
      className={`flex min-w-0 items-center gap-2.5 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs text-muted-foreground ${inStrip ? 'h-44 w-56 max-w-full' : 'h-20 w-full'}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block font-medium text-foreground/80">
          {placeholderTitle(item, reason)}
        </span>
        <span className="block truncate font-mono text-[11px]">{basename(item.source)}</span>
      </span>
    </div>
  )
}

function ProofCaption({ item, prefix }: { item: NativeChatProofMedia; prefix?: string }) {
  const parts = [prefix, item.caption, item.where].filter(Boolean)
  if (parts.length === 0) {
    return null
  }
  return (
    <figcaption
      data-proof-caption=""
      className="mt-1 min-w-0 truncate text-[11px] leading-4 text-muted-foreground"
      title={parts.join(' · ')}
    >
      {parts.join(' · ')}
    </figcaption>
  )
}

function Skeleton({ className }: { className: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      data-proof-media-loading=""
      className={`block animate-pulse rounded-md bg-muted ${className}`}
    />
  )
}

/** A recording that plays muted and looped in the card; a click shows it full screen. */
function ProofVideo({ item }: { item: NativeChatProofMedia }): React.JSX.Element {
  const video = useNativeChatProofVideo(item.path)
  const ref = useRef<HTMLVideoElement>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  useEffect(() => {
    const sync = (): void => setFullScreen(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const label = itemLabel(item)
  let body: React.JSX.Element
  if (item.path === null) {
    body = <ProofPlaceholder item={item} reason="outside-folder" />
  } else if (video.status === 'loading') {
    body = <Skeleton className="aspect-video w-full" />
  } else if (video.status === 'missing') {
    body = <ProofPlaceholder item={item} reason={video.reason} />
  } else {
    const open = (): void => {
      const element = ref.current
      // The dialog stands in wherever the element cannot go full screen.
      if (!element || typeof element.requestFullscreen !== 'function') {
        setDialogOpen(true)
        return
      }
      element.requestFullscreen().catch(() => setDialogOpen(true))
    }
    body = (
      <>
        <div className="group/proof-video relative w-fit max-w-full">
          <video
            ref={ref}
            data-proof-video=""
            src={video.value}
            muted
            loop
            autoPlay
            playsInline
            controls={fullScreen}
            aria-label={label}
            className="block max-h-[22rem] w-auto max-w-full rounded-md border border-border/60 bg-black object-contain"
          />
          <button
            type="button"
            data-proof-video-open=""
            onClick={open}
            aria-label={translate(
              'components.native-chat.proof.playFullScreen',
              'Play {{value0}} full screen',
              { value0: label }
            )}
            className="absolute inset-0 flex items-end justify-end rounded-md p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-black/55 text-white opacity-80 transition-opacity group-hover/proof-video:opacity-100">
              <Maximize2 className="size-3.5" />
            </span>
          </button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="flex max-h-[92vh] max-w-[92vw] flex-col gap-3 border-border bg-background p-3 sm:max-w-5xl">
            <DialogTitle className="truncate text-sm">{label}</DialogTitle>
            <DialogDescription className="sr-only">
              {translate('components.native-chat.proof.recording', 'Recording')}
            </DialogDescription>
            <video
              src={video.value}
              muted
              loop
              autoPlay
              playsInline
              controls
              className="max-h-[80vh] w-full rounded-md bg-black object-contain"
            />
          </DialogContent>
        </Dialog>
      </>
    )
  }
  return (
    <figure data-proof-media="video" className="m-0 min-w-0">
      {body}
      <ProofCaption item={item} />
    </figure>
  )
}

/** One screenshot in the strip; a click shows it full size. */
function ProofImage({ item }: { item: NativeChatProofMedia }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const thumbnail = useNativeChatProofImage(item.path, 'thumbnail')
  const full = useNativeChatProofImage(open ? item.path : null, 'full')
  const label = itemLabel(item)
  const prefix =
    item.role === 'before'
      ? translate('components.native-chat.proof.before', 'Before')
      : item.role === 'after'
        ? translate('components.native-chat.proof.after', 'After')
        : undefined
  let body: React.JSX.Element
  if (item.path === null) {
    body = <ProofPlaceholder item={item} reason="outside-folder" inStrip />
  } else if (thumbnail.status === 'loading') {
    body = <Skeleton className="h-44 w-32" />
  } else if (thumbnail.status === 'missing') {
    body = <ProofPlaceholder item={item} reason={thumbnail.reason} inStrip />
  } else {
    body = (
      <>
        <button
          type="button"
          data-proof-image=""
          aria-label={`${translate('components.native-chat.composer.viewAttachment', 'View image')}: ${label}`}
          title={label}
          onClick={() => setOpen(true)}
          className="block h-44 max-w-full overflow-hidden rounded-md border border-border bg-muted/20 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={thumbnail.value.src}
            alt={label}
            draggable={false}
            className="h-full w-auto max-w-full object-contain"
          />
        </button>
        <NativeChatImagePreviewDialog
          open={open}
          onOpenChange={setOpen}
          label={label}
          src={full.status === 'ready' ? full.value.src : thumbnail.value.src}
        />
      </>
    )
  }
  return (
    <figure
      data-proof-media="image"
      className="m-0 flex min-w-0 max-w-[85%] shrink-0 snap-start flex-col"
    >
      {body}
      <ProofCaption item={item} prefix={prefix} />
    </figure>
  )
}

/** Before over after, split by a handle you drag (or move with the arrow keys). */
function ProofCompare({
  before,
  after
}: {
  before: NativeChatProofMedia
  after: NativeChatProofMedia
}): React.JSX.Element {
  const [position, setPosition] = useState(50)
  const beforeImage = useNativeChatProofImage(before.path, 'full')
  const afterImage = useNativeChatProofImage(after.path, 'full')
  if (before.path === null || after.path === null) {
    return <ProofStrip items={[before, after]} />
  }
  if (beforeImage.status === 'missing' || afterImage.status === 'missing') {
    return <ProofStrip items={[before, after]} />
  }
  if (beforeImage.status === 'loading' || afterImage.status === 'loading') {
    return <Skeleton className="aspect-video w-full" />
  }
  const { width, height } = afterImage.value
  const aspect = width && height ? width / height : 16 / 10
  const beforeLabel = translate('components.native-chat.proof.before', 'Before')
  const afterLabel = translate('components.native-chat.proof.after', 'After')
  return (
    <figure data-proof-media="compare" className="m-0 min-w-0">
      <div
        data-proof-compare=""
        className="relative max-w-full select-none overflow-hidden rounded-md border border-border bg-muted/20"
        style={{
          aspectRatio: String(aspect),
          width: `min(100%, calc(22rem * ${aspect}))`
        }}
      >
        <img
          src={afterImage.value.src}
          alt={`${afterLabel}: ${itemLabel(after)}`}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
        />
        <img
          data-proof-compare-before=""
          src={beforeImage.value.src}
          alt={`${beforeLabel}: ${itemLabel(before)}`}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background shadow-[0_0_0_1px_var(--border)]"
          style={{ left: `${position}%` }}
        >
          <span className="absolute left-1/2 top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm">
            <ChevronsLeftRight className="size-4" />
          </span>
        </span>
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
          {beforeLabel}
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
          {afterLabel}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label={translate(
            'components.native-chat.proof.compare',
            'Drag to compare before and after'
          )}
          className="absolute inset-0 m-0 h-full w-full cursor-ew-resize appearance-none opacity-0"
        />
      </div>
      <ProofCaption item={before} prefix={beforeLabel} />
      <ProofCaption item={after} prefix={afterLabel} />
    </figure>
  )
}

function ProofStrip({ items }: { items: readonly NativeChatProofMedia[] }) {
  if (items.length === 0) {
    return null
  }
  return (
    <div
      data-proof-strip=""
      className="scrollbar-sleek -mx-0.5 flex min-w-0 snap-x gap-2 overflow-x-auto px-0.5 pb-1"
    >
      {items.map((item, index) => (
        <ProofImage key={`${index}:${item.source}`} item={item} />
      ))}
    </div>
  )
}

/** A proof card's media: recordings first, then a before/after slider when the card
 *  has exactly one of each, then the other screenshots as a scrolling strip. */
export function NativeChatProofViewer({
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
    <div data-proof-viewer="" className="flex min-w-0 flex-col gap-2.5">
      {videos.map((item, index) => (
        <ProofVideo key={`${index}:${item.source}`} item={item} />
      ))}
      {pair ? <ProofCompare before={pair.before} after={pair.after} /> : null}
      <ProofStrip items={images} />
    </div>
  )
}
