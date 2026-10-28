import { useMemo, useState } from 'react'
import { Globe } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  nativeChatLinkCardFallbackTitle,
  nativeChatLinkCardHost,
  parseNativeChatLinkCards,
  type NativeChatLinkCardItem,
  type NativeChatLinkCardsLayout
} from '../../../../shared/native-chat-link-cards-payload'
import { useNativeChatLinkPreview } from './use-native-chat-link-preview'

type LinkCardView = {
  url: string
  title: string
  description?: string
  site: string
  image?: string
  icon?: string
}

/** The card's own fields first; the page's fill the gaps, the host name the rest. */
function useLinkCardView(item: NativeChatLinkCardItem): LinkCardView {
  const preview = useNativeChatLinkPreview(item)
  return useMemo(() => {
    const host = nativeChatLinkCardHost(item.url)
    return {
      url: item.url,
      title: item.title ?? preview?.title ?? nativeChatLinkCardFallbackTitle(item.url),
      description: item.description ?? preview?.description,
      site: item.site ?? preview?.site ?? host,
      image: preview?.image,
      icon: preview?.icon
    }
  }, [item, preview])
}

/** A data: image that steps aside when it fails to decode. */
function DataImage({
  src,
  className,
  fallback
}: {
  src: string | undefined
  className: string
  fallback: React.ReactNode
}): React.JSX.Element {
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) {
    return <>{fallback}</>
  }
  return (
    <img src={src} alt="" draggable={false} className={className} onError={() => setFailed(src)} />
  )
}

function SiteIcon({ view, className }: { view: LinkCardView; className: string }) {
  return (
    <DataImage
      src={view.icon}
      className={cn('shrink-0 rounded-sm object-contain', className)}
      fallback={<Globe aria-hidden className={cn('shrink-0 text-muted-foreground', className)} />}
    />
  )
}

/** The image area: the page's picture, else its icon on a muted tile. */
function Thumbnail({ view, className }: { view: LinkCardView; className: string }) {
  return (
    <div
      data-link-card-thumbnail={view.image ? 'image' : 'icon'}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-muted',
        className
      )}
    >
      <DataImage
        src={view.image}
        className="size-full object-cover"
        fallback={<SiteIcon view={view} className="size-7" />}
      />
    </div>
  )
}

function SiteRow({ view }: { view: LinkCardView }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-2xs leading-4 text-muted-foreground">
      <SiteIcon view={view} className="size-3.5" />
      <span data-link-card-site="" className="min-w-0 truncate">
        {view.site}
      </span>
    </div>
  )
}

function LinkCard({
  item,
  layout
}: {
  item: NativeChatLinkCardItem
  layout: NativeChatLinkCardsLayout
}): React.JSX.Element {
  const view = useLinkCardView(item)
  const grid = layout === 'grid'
  return (
    <a
      href={view.url}
      title={view.url}
      data-link-card={view.url}
      onClick={(event) => {
        event.preventDefault()
        void window.api.shell.openUrl(view.url)
      }}
      className={cn(
        'flex min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground no-underline transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        grid ? 'flex-col' : 'min-h-[4.5rem] items-stretch'
      )}
    >
      <Thumbnail
        view={view}
        className={grid ? 'aspect-[1.91/1] w-full border-b border-border' : 'w-24 self-stretch'}
      />
      <div className={cn('flex min-w-0 flex-1 flex-col gap-1', grid ? 'p-2.5' : 'px-3 py-2.5')}>
        <SiteRow view={view} />
        <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {view.title}
        </span>
        {view.description ? (
          <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {view.description}
          </span>
        ) : null}
      </div>
    </a>
  )
}

/** Keys by URL; a URL the card repeats gets its occurrence number. */
function linkCardKeys(items: readonly NativeChatLinkCardItem[]) {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const count = seen.get(item.url) ?? 0
    seen.set(item.url, count + 1)
    return { key: count === 0 ? item.url : `${item.url}#${count}`, item }
  })
}

/**
 * A ```link-cards fence: shared web pages as link previews, a list (thumbnail left)
 * or a two-column grid (image on top). Page details come from the chat's host; a
 * tap opens the page in the browser. Anything off the schema shows `fallback`.
 */
export function NativeChatLinkCards({
  source,
  fallback
}: {
  source: string
  fallback: React.ReactNode
}): React.JSX.Element {
  const cards = useMemo(() => parseNativeChatLinkCards(source), [source])
  if (!cards) {
    return <>{fallback}</>
  }
  return (
    <figure data-native-chat-link-cards={cards.layout} className="my-3 flex min-w-0 flex-col gap-2">
      <div
        className={cn(
          'min-w-0',
          cards.layout === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'
        )}
      >
        {linkCardKeys(cards.items).map(({ key, item }) => (
          <LinkCard key={key} item={item} layout={cards.layout} />
        ))}
      </div>
      {cards.hidden > 0 ? (
        <figcaption className="text-xs text-muted-foreground">
          {translate('components.native-chat.linkCards.more', '{{count}} more links not shown', {
            count: cards.hidden
          })}
        </figcaption>
      ) : null}
    </figure>
  )
}
