// Sizes rich chat content last settled at. FlatList unmounts rows far from the viewport and
// remounts them on the way back; starting a remounted row at a placeholder's size and growing
// once its media or WebView reports in moved everything below it: the scroll flicker.

const MAX_ENTRIES = 400

export type MobileNativeChatSizeMemory<T> = {
  get: (key: string) => T | undefined
  set: (key: string, value: T) => void
}

/** A small most-recently-used map. */
export function createMobileNativeChatSizeMemory<T>(
  maxEntries = MAX_ENTRIES
): MobileNativeChatSizeMemory<T> {
  const entries = new Map<string, T>()
  return {
    get: (key) => entries.get(key),
    set: (key, value) => {
      entries.delete(key)
      entries.set(key, value)
      while (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value!)
      }
    }
  }
}

/** WebView heights (diagrams, previews, visuals), keyed by kind and source. */
export const mobileNativeChatHeightMemory = createMobileNativeChatSizeMemory<number>()

/** Proof media's natural size (a recording's track), keyed by proof path. */
export const mobileNativeChatMediaSizeMemory = createMobileNativeChatSizeMemory<{
  width: number
  height: number
}>()

let columnWidth = 0

/** The width proof media last laid out at; every card in a chat has the same column. */
export function mobileNativeChatMediaColumnWidth(): number {
  return columnWidth
}

export function rememberMobileNativeChatMediaColumnWidth(width: number): void {
  if (width > 0) {
    columnWidth = width
  }
}
