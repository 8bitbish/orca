import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { NativeChatProjectIconSource } from './native-chat-project-icon'

/** A project's icon at chip (`sm`, 16px) or card (`md`, 24px) size. Decorative: the
 *  name beside it carries the meaning. */
export function NativeChatProjectIcon({
  source,
  size
}: {
  source: NativeChatProjectIconSource
  size: 'sm' | 'md'
}): React.JSX.Element {
  // An app icon that fails to decode falls back to the monogram, never a broken image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const box = size === 'sm' ? 'size-4 rounded-[4px]' : 'size-6 rounded-md'
  if (source.kind === 'app' && failedSrc !== source.src) {
    return (
      <img
        src={source.src}
        alt=""
        aria-hidden
        draggable={false}
        onError={() => setFailedSrc(source.src)}
        className={cn('shrink-0 object-contain', box)}
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
          size === 'sm' ? 'text-[12px]' : 'text-[16px]'
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
        size === 'sm' ? 'text-[10px]' : 'text-[12px]'
      )}
    >
      {monogram.letter}
    </span>
  )
}
