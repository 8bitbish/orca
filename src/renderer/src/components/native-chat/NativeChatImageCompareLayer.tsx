import { useRef } from 'react'
import { ChevronsLeftRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ImageZoomSize, ImageZoomView } from '../../../../shared/image-zoom-pan'

export type NativeChatImageCompare = {
  /** The before image, drawn over the viewer's (after) image and clipped to the divider. */
  src: string
  label: string
  /** The divider, in percent of the viewer's width. */
  position: number
  onPositionChange: (position: number) => void
}

/** The full-screen slider: before over the zoomed after image in the same placement, cut at
 *  a divider you drag (or move with the arrow keys). Lives inside the viewer's surface. */
export function NativeChatImageCompareLayer({
  compare,
  view,
  image
}: {
  compare: NativeChatImageCompare
  view: ImageZoomView
  image: ImageZoomSize
}): React.JSX.Element {
  const dragging = useRef<number | null>(null)
  const { position, onPositionChange } = compare
  const positionAt = (element: HTMLElement, clientX: number): number => {
    const surface = element.closest<HTMLElement>('[data-image-viewer-surface]') ?? element
    const rect = surface.getBoundingClientRect()
    if (!(rect.width > 0)) {
      return position
    }
    return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
  }
  return (
    <>
      <div
        aria-hidden
        data-image-viewer-compare-clip=""
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={compare.src}
          alt=""
          draggable={false}
          data-image-viewer-compare-before=""
          className="absolute left-0 top-0 max-w-none origin-top-left object-contain"
          style={{
            width: image.width,
            height: image.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
          }}
        />
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-2xs font-medium text-foreground">
        {translate('components.native-chat.proof.before', 'Before')}
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-2xs font-medium text-foreground">
        {translate('components.native-chat.proof.after', 'After')}
      </span>
      <div
        data-image-viewer-compare-divider=""
        // The surface pans and zooms; a press on the divider only moves it.
        onPointerDown={(event) => {
          event.stopPropagation()
          if (event.button !== 0) {
            return
          }
          dragging.current = event.pointerId
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (dragging.current === event.pointerId) {
            event.stopPropagation()
            onPositionChange(positionAt(event.currentTarget, event.clientX))
          }
        }}
        onPointerUp={(event) => {
          event.stopPropagation()
          dragging.current = null
        }}
        onPointerCancel={() => {
          dragging.current = null
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className="absolute inset-y-0 w-6 -translate-x-1/2 cursor-ew-resize"
        style={{ left: `${position}%` }}
      >
        <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-background shadow-[0_0_0_1px_var(--border)]" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm">
          <ChevronsLeftRight className="size-4" />
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => onPositionChange(Number(event.target.value))}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={translate(
          'components.native-chat.proof.compare',
          'Drag to compare before and after'
        )}
        className="sr-only"
      />
    </>
  )
}
