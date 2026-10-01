import { useState } from 'react'
import { cn } from '@/lib/utils'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { resolveRepoHeaderColor } from '@/components/sidebar/project-header-color'
import type { NativeChatProjectIconSource } from './native-chat-project-icon'

/** A project's icon at chip (`sm`, a 14px disc concentric with the pill's end) or
 *  card (`md`, a 24px rounded square) size. Decorative: the name beside it carries
 *  the meaning. */
export function NativeChatProjectIcon({
  source,
  size
}: {
  source: NativeChatProjectIconSource
  size: 'sm' | 'md'
}): React.JSX.Element {
  // An app icon that fails to decode falls back to the monogram, never a broken image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const box = size === 'sm' ? 'size-3.5 rounded-full' : 'size-6 rounded-md'
  if (source.kind === 'repo') {
    const { repoIcon } = source
    // The sidebar's own glyph, so a chip and the sidebar row always agree.
    return (
      <RepoIconGlyph
        repoIcon={repoIcon}
        color={resolveRepoHeaderColor(source.badgeColor)}
        className={cn(
          'shrink-0',
          box,
          repoIcon.type !== 'image' && 'bg-muted',
          repoIcon.type === 'emoji' && (size === 'sm' ? 'text-[11px]' : 'text-[16px]')
        )}
        iconClassName={
          repoIcon.type === 'image' ? 'size-full' : size === 'sm' ? 'size-2.5' : 'size-4'
        }
      />
    )
  }
  if (source.kind === 'app' && failedSrc !== source.src) {
    return (
      <img
        src={source.src}
        alt=""
        aria-hidden
        draggable={false}
        onError={() => setFailedSrc(source.src)}
        className={cn('shrink-0 object-cover', box)}
      />
    )
  }
  if (source.kind === 'payload') {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex shrink-0 items-center justify-center leading-none',
          box,
          size === 'sm' ? 'text-[11px]' : 'text-[16px]'
        )}
      >
        {source.glyph}
      </span>
    )
  }
  const monogram = source.kind === 'app' ? source.fallback : source
  return (
    <span
      aria-hidden
      // The hashed colour is data, not a theme role, so it rides inline like the repo badge mark.
      style={{
        backgroundColor: `color-mix(in srgb, ${monogram.color} 28%, var(--card))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${monogram.color} 45%, transparent)`
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold leading-none text-foreground',
        box,
        size === 'sm' ? 'text-[9px]' : 'text-[12px]'
      )}
    >
      {monogram.letter}
    </span>
  )
}
