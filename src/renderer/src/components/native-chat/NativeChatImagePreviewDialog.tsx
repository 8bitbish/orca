import { Image as ImageIcon, Loader2, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { useNativeChatImageZoom } from './use-native-chat-image-zoom'

const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** The dialog's accessible title, and the same label as a one-line header. */
function ViewerTitle({ label }: { label: string }): React.JSX.Element {
  return (
    <>
      <DialogTitle className="sr-only">{label}</DialogTitle>
      <p aria-hidden title={label} className="min-w-0 flex-1 truncate text-sm font-medium">
        {label}
      </p>
    </>
  )
}

function ZoomableImage({
  src,
  label,
  onDismiss,
  accessory
}: {
  src: string
  label: string
  onDismiss: () => void
  accessory?: React.ReactNode
}): React.JSX.Element {
  const zoom = useNativeChatImageZoom(onDismiss)
  const { view, image } = zoom
  const percent = view ? Math.round(view.scale * 100) : null
  const hint = translate(
    'components.native-chat.imageViewer.hint',
    'Pinch or {{value0}}-scroll to zoom · drag to pan · double-click for 100% · Esc to close',
    { value0: isMac ? '⌘' : 'Ctrl' }
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={zoom.onKeyDown}>
      <div className="flex shrink-0 items-center gap-2 pb-3">
        <ViewerTitle label={label} />
        {accessory}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={zoom.zoomOut}
            aria-label={translate('components.native-chat.imageViewer.zoomOut', 'Zoom out')}
          >
            <Minus />
          </Button>
          <span
            data-image-viewer-zoom=""
            aria-live="polite"
            className="w-11 text-center text-xs tabular-nums text-muted-foreground"
          >
            {percent === null ? '' : `${percent}%`}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={zoom.zoomIn}
            aria-label={translate('components.native-chat.imageViewer.zoomIn', 'Zoom in')}
          >
            <Plus />
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="xs" onClick={() => zoom.fit('screen')}>
            {translate('components.native-chat.imageViewer.fit', 'Fit')}
          </Button>
          <Button variant="ghost" size="xs" onClick={() => zoom.fit('width')}>
            {translate('components.native-chat.imageViewer.fitWidth', 'Fit width')}
          </Button>
          <Button variant="ghost" size="xs" onClick={() => zoom.fit('actual')}>
            100%
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          data-image-viewer-close=""
          onClick={onDismiss}
          aria-label={translate('auto.components.ui.dialog.f26c4baeda', 'Close')}
        >
          <X />
        </Button>
      </div>
      <div
        ref={zoom.setSurface}
        data-image-viewer-surface=""
        data-pannable={zoom.pannable ? 'true' : 'false'}
        tabIndex={0}
        aria-label={translate('components.native-chat.imageViewer.surface', 'Image, zoom and pan')}
        onPointerDown={zoom.onPointerDown}
        onPointerMove={zoom.onPointerMove}
        onPointerUp={zoom.onPointerUp}
        onPointerCancel={zoom.onPointerCancel}
        onDoubleClick={zoom.onDoubleClick}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden rounded-md border border-border bg-muted/20 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[pannable=true]:cursor-grab"
        style={zoom.dragging ? { cursor: 'grabbing' } : undefined}
      >
        <img
          src={src}
          alt={label}
          draggable={false}
          onLoad={zoom.onImageLoad}
          data-image-viewer-image=""
          className="absolute left-0 top-0 max-w-none origin-top-left"
          style={
            view && image
              ? {
                  width: image.width,
                  height: image.height,
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
                }
              : { visibility: 'hidden' }
          }
        />
      </div>
      <p className="shrink-0 truncate pt-2 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

/** The chat's full-screen image viewer, with zoom and pan: proof cards, Slack card
 *  images and composer attachments. */
export function NativeChatImagePreviewDialog({
  open,
  onOpenChange,
  label,
  src,
  pendingLabel,
  accessory
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  src: string | null | undefined
  /** Shown with a spinner while `src` is still on its way; otherwise "Preview unavailable". */
  pendingLabel?: string
  /** Extra header controls, such as a before/after switch. */
  accessory?: React.ReactNode
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-native-chat-image-viewer=""
        onOpenAutoFocus={(event) => {
          // The image surface takes focus so the zoom keys work straight away.
          const surface = document.querySelector<HTMLElement>(
            '[data-native-chat-image-viewer] [data-image-viewer-surface]'
          )
          if (surface) {
            event.preventDefault()
            surface.focus()
          }
        }}
        className="flex h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[calc(100vw-2rem)]"
      >
        <DialogDescription className="sr-only">
          {translate('components.native-chat.composer.imagePreview', 'Full-size image preview')}
        </DialogDescription>
        {src ? (
          <ZoomableImage
            src={src}
            label={label}
            accessory={accessory}
            onDismiss={() => onOpenChange(false)}
          />
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 pb-3">
              <ViewerTitle label={label} />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                aria-label={translate('auto.components.ui.dialog.f26c4baeda', 'Close')}
              >
                <X />
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              {pendingLabel ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {pendingLabel}
                </>
              ) : (
                <>
                  <ImageIcon className="size-4" />
                  {translate(
                    'components.native-chat.composer.imagePreviewUnavailable',
                    'Preview unavailable'
                  )}
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
