import { Image as ImageIcon, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'

/** The chat's full-size image preview: composer attachments and Slack card images. */
export function NativeChatImagePreviewDialog({
  open,
  onOpenChange,
  label,
  src,
  pendingLabel
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  src: string | null | undefined
  /** Shown with a spinner while `src` is still on its way; otherwise "Preview unavailable". */
  pendingLabel?: string
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[90vw] flex-col gap-3 border-border bg-background p-3 sm:max-w-4xl">
        <DialogTitle className="truncate text-sm">{label}</DialogTitle>
        <DialogDescription className="sr-only">
          {translate('components.native-chat.composer.imagePreview', 'Full-size image preview')}
        </DialogDescription>
        <div className="scrollbar-sleek flex min-h-0 items-center justify-center overflow-auto rounded-md bg-muted/20 p-2">
          {src ? (
            <img src={src} alt={label} className="max-h-[75vh] max-w-full object-contain" />
          ) : (
            <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
