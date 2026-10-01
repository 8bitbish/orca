import type React from 'react'
import { cn } from '@/lib/utils'

/**
 * The inline pill every chat chip draws with: exactly one 20px prose line box,
 * top-aligned, so a chip never spreads its line and centres on the prose glyphs.
 * `lead="icon"` keeps the smaller left padding for a disc concentric with the
 * pill's end; `lead="text"` pads both ends evenly.
 */
export function NativeChatChipButton({
  lead,
  onActivate,
  children,
  ...rest
}: Omit<React.ComponentPropsWithoutRef<'button'>, 'onClick' | 'type' | 'className'> & {
  lead: 'icon' | 'text'
  onActivate: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      {...rest}
      onClick={(event) => {
        // A chip sits inside selectable reply prose; the click is the chip's alone.
        event.stopPropagation()
        onActivate()
      }}
      className={cn(
        'mx-0.5 inline-flex h-5 max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 align-top text-[12px] leading-4 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
        lead === 'icon' ? 'pl-0.5 pr-1' : 'px-1.5'
      )}
    >
      {children}
    </button>
  )
}
