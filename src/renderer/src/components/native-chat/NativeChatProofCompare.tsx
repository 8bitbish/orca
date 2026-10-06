import { useRef, useState } from 'react'
import { ChevronsLeftRight, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import { imageThumbnailFrame, isTallImage } from '../../../../shared/image-thumbnail-frame'
import type { NativeChatProofMedia } from '../../../../shared/native-chat-proof-card-payload'
import { NativeChatImagePreviewDialog } from './NativeChatImagePreviewDialog'
import { NATIVE_CHAT_IMAGE_CLICK_SLOP } from './use-native-chat-image-zoom'
import { useNativeChatProofImage } from './use-native-chat-proof-media'

/** The slider's fixed frame: one height for every pair, as wide as the card allows. */
const COMPARE_BOX = { height: 320, minWidth: 240, maxWidth: 720 }

type Side = 'before' | 'after'

function proofItemLabel(item: NativeChatProofMedia): string {
  return item.caption ?? basename(item.source)
}

/** Fades the bottom of a top-cropped image and says there is more below. */
export function NativeChatProofTallCue(): React.JSX.Element {
  return (
    <span
      aria-hidden
      data-proof-tall-cue=""
      className="pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-start bg-gradient-to-t from-background/95 via-background/60 to-transparent pb-2 pl-2"
    >
      <span className="flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
        <Maximize2 className="size-3" />
        {translate('components.native-chat.proof.tallImage', 'Tall image, click to see it all')}
      </span>
    </span>
  )
}

/** Before over after, split by a handle you drag (or move with the arrow keys). A click
 *  that does not drag opens the side it landed on full screen. */
export function NativeChatProofCompare({
  before,
  after,
  fallback,
  loading,
  captions
}: {
  before: NativeChatProofMedia
  after: NativeChatProofMedia
  /** Shown when either side cannot be (two separate tiles). */
  fallback: React.ReactNode
  loading: React.ReactNode
  captions: React.ReactNode
}): React.JSX.Element {
  const [position, setPosition] = useState(50)
  const [openSide, setOpenSide] = useState<Side | null>(null)
  const press = useRef<{ pointerId: number; x: number; y: number; dragging: boolean } | null>(null)
  const beforeImage = useNativeChatProofImage(before.path, 'thumbnail')
  const afterImage = useNativeChatProofImage(after.path, 'thumbnail')
  const beforeFull = useNativeChatProofImage(openSide ? before.path : null, 'full')
  const afterFull = useNativeChatProofImage(openSide ? after.path : null, 'full')
  if (beforeImage.status === 'missing' || afterImage.status === 'missing') {
    return <>{fallback}</>
  }
  if (beforeImage.status === 'loading' || afterImage.status === 'loading') {
    return <>{loading}</>
  }
  const frame = imageThumbnailFrame(afterImage.value.width, afterImage.value.height, COMPARE_BOX)
  const tall = frame.tall || isTallImage(beforeImage.value.width, beforeImage.value.height)
  const fit = tall ? 'top' : 'contain'
  const beforeLabel = translate('components.native-chat.proof.before', 'Before')
  const afterLabel = translate('components.native-chat.proof.after', 'After')

  const positionAt = (element: HTMLElement, clientX: number): number => {
    const rect = element.getBoundingClientRect()
    if (!(rect.width > 0)) {
      return position
    }
    return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
  }
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return
    }
    press.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false
    }
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const active = press.current
    if (!active || active.pointerId !== event.pointerId) {
      return
    }
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.x) < NATIVE_CHAT_IMAGE_CLICK_SLOP) {
        return
      }
      active.dragging = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    setPosition(positionAt(event.currentTarget, event.clientX))
  }
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const active = press.current
    press.current = null
    if (!active || active.pointerId !== event.pointerId || active.dragging) {
      return
    }
    if (
      Math.hypot(event.clientX - active.x, event.clientY - active.y) >= NATIVE_CHAT_IMAGE_CLICK_SLOP
    ) {
      return
    }
    setOpenSide(positionAt(event.currentTarget, event.clientX) < position ? 'before' : 'after')
  }

  const shown = openSide === 'before' ? before : after
  const shownThumb = openSide === 'before' ? beforeImage.value : afterImage.value
  const shownFull = openSide === 'before' ? beforeFull : afterFull
  const sideLabel = openSide === 'before' ? beforeLabel : afterLabel
  return (
    <figure data-proof-media="compare" className="m-0 min-w-0">
      <div
        data-proof-compare=""
        data-fit={fit}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null
        }}
        className="group/proof-compare relative max-w-full cursor-ew-resize touch-pan-y select-none overflow-hidden rounded-md border border-border bg-muted/20 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring"
        style={{ width: frame.width, height: frame.height }}
      >
        <img
          src={afterImage.value.src}
          alt={`${afterLabel}: ${proofItemLabel(after)}`}
          draggable={false}
          data-fit={fit}
          className="absolute inset-0 h-full w-full object-contain data-[fit=top]:object-cover data-[fit=top]:object-top"
        />
        <img
          data-proof-compare-before=""
          src={beforeImage.value.src}
          alt={`${beforeLabel}: ${proofItemLabel(before)}`}
          draggable={false}
          data-fit={fit}
          className="absolute inset-0 h-full w-full object-contain data-[fit=top]:object-cover data-[fit=top]:object-top"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
        {tall ? <NativeChatProofTallCue /> : null}
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
          className="sr-only"
        />
        <button
          type="button"
          data-proof-compare-open=""
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={() => setOpenSide('after')}
          aria-label={translate(
            'components.native-chat.proof.compareFullScreen',
            'View before and after full screen'
          )}
          className="absolute bottom-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-md bg-black/55 text-white opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/proof-compare:opacity-100"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>
      {captions}
      <NativeChatImagePreviewDialog
        open={openSide !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenSide(null)
          }
        }}
        label={`${sideLabel}: ${proofItemLabel(shown)}`}
        src={shownFull.status === 'ready' ? shownFull.value.src : shownThumb.src}
        accessory={
          <div
            role="group"
            aria-label={translate('components.native-chat.proof.compareSide', 'Show side')}
            className="flex items-center gap-0.5"
          >
            {(['before', 'after'] as const).map((side) => (
              <Button
                key={side}
                variant={openSide === side ? 'secondary' : 'ghost'}
                size="xs"
                aria-pressed={openSide === side}
                data-proof-compare-side={side}
                onClick={() => setOpenSide(side)}
              >
                {side === 'before' ? beforeLabel : afterLabel}
              </Button>
            ))}
          </div>
        }
      />
    </figure>
  )
}
