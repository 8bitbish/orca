import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import type { NativeChatSlackImage } from '../../../../shared/native-chat-slack-card-payload'
import { NativeChatImagePreviewDialog } from './NativeChatImagePreviewDialog'
import { useNativeChatSlackImage } from './use-native-chat-slack-image'

function SlackImageThumbnail({ image }: { image: NativeChatSlackImage }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const thumbnail = useNativeChatSlackImage(image.path, 'thumbnail')
  // The full image is only fetched once someone asks to see it.
  const full = useNativeChatSlackImage(open ? image.path : null, 'full')
  const label = image.name ?? basename(image.path)
  if (thumbnail.status === 'missing') {
    return null
  }
  if (thumbnail.status === 'loading') {
    return (
      <span
        aria-hidden
        data-slack-image-loading=""
        className="block h-24 w-32 shrink-0 animate-pulse rounded-md bg-muted"
      />
    )
  }
  const fullSrc = full.status === 'ready' ? full.image.src : thumbnail.image.src
  return (
    <>
      <button
        type="button"
        data-slack-image=""
        aria-label={`${translate('components.native-chat.composer.viewAttachment', 'View image')}: ${label}`}
        title={label}
        onClick={() => setOpen(true)}
        className="block h-24 min-w-0 max-w-full shrink-0 overflow-hidden rounded-md border border-border bg-muted/20 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={thumbnail.image.src}
          alt={label}
          className="h-full w-auto max-w-full object-cover"
        />
      </button>
      <NativeChatImagePreviewDialog
        open={open}
        onOpenChange={setOpen}
        label={label}
        src={fullSrc}
      />
    </>
  )
}

/** A Slack card's images as thumbnails that open full size; a missing one is left out. */
export function NativeChatSlackImages({
  images
}: {
  images: readonly NativeChatSlackImage[]
}): React.JSX.Element | null {
  if (images.length === 0) {
    return null
  }
  return (
    // `empty:hidden`: when every image is missing, the row takes no gap in the card.
    <div className="flex min-w-0 flex-wrap gap-2 empty:hidden">
      {images.map((image) => (
        <SlackImageThumbnail key={image.path} image={image} />
      ))}
    </div>
  )
}
