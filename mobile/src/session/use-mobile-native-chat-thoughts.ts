import { useCallback, useState } from 'react'
import type { MobileNativeChatThoughtFor } from './MobileNativeChatMessage'

/** Each reasoning row's fold. Open state lives here, not in the row: the list
 *  unmounts rows it scrolls past. */
export function useMobileNativeChatThoughts(args: {
  thoughtSeconds: ReadonlyMap<string, number>
  /** The row that is still the newest output of a working turn, if any. */
  liveRowId: string | null
}): MobileNativeChatThoughtFor {
  const { thoughtSeconds, liveRowId } = args
  const [openThoughts, setOpenThoughts] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = useCallback((id: string) => {
    setOpenThoughts((current) => {
      const next = new Set(current)
      if (!next.delete(id)) {
        next.add(id)
      }
      return next
    })
  }, [])
  return useCallback(
    (item) =>
      item.role === 'reasoning'
        ? {
            seconds: thoughtSeconds.get(item.id) ?? null,
            live: item.id === liveRowId,
            open: openThoughts.has(item.id),
            onToggle: () => toggle(item.id)
          }
        : undefined,
    [liveRowId, openThoughts, thoughtSeconds, toggle]
  )
}
