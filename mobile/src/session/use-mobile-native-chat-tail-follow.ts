import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

// Anchors the first visible row, so rows above the viewport settling to a new height (media,
// diagrams, older history) no longer shove what you're reading. Following the tail stays here.
const MAINTAIN_VISIBLE_CONTENT = { minIndexForVisible: 0 } as const

/** Distance from the bottom, in points, still treated as "at the tail". */
const AT_TAIL_SLOP = 80

function isAtTail(event: NativeScrollEvent): boolean {
  const { contentOffset, contentSize, layoutMeasurement } = event
  return contentSize.height - (contentOffset.y + layoutMeasurement.height) <= AT_TAIL_SLOP
}

export type MobileNativeChatTailFollow<TItem> = {
  /** Attach to the transcript list; the hook scrolls through this ref alone. */
  listRef: RefObject<FlatList<TItem> | null>
  /** Render flag for the jump-to-latest control. */
  showJumpToTail: boolean
  /** Passive maintenance: re-pin after the viewport resizes. */
  pinToTail: () => void
  /** Content-size maintenance using the list's authoritative measured height. */
  pinToTailAfterContentResize: (_width: number, height: number) => void
  /** Explicit jump — send, or the jump-to-latest control. Resumes following. */
  jumpToTail: () => void
  beginUserScroll: () => void
  endUserDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  beginMomentum: () => void
  endMomentum: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  /** Leave the tail deliberately, e.g. before prepending older history. */
  detachFromTail: () => void
  recordScrollMetrics: (event: NativeScrollEvent) => void
  /** The scroll wiring above, spread onto the transcript list. */
  listProps: {
    onScrollBeginDrag: () => void
    onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
    onMomentumScrollBegin: () => void
    onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
    onContentSizeChange: (width: number, height: number) => void
    onLayout: () => void
    maintainVisibleContentPosition: typeof MAINTAIN_VISIBLE_CONTENT
  }
}

/** Sole owner of transcript scroll position.
 *
 *  Streaming used to have several tail-followers at once: a delayed *animated*
 *  `scrollToEnd` alongside an immediate non-animated one on content growth. The
 *  animated command eases toward the endpoint measured when it started, so while
 *  tokens kept arriving it ran backwards until the content-size pin yanked it
 *  forward — the visible drift-then-snap. One owner, never animated, removes it.
 *
 *  Intent (`following`) is kept separate from geometry (at-tail): a programmatic
 *  scroll reports metrics like any other, so letting metrics decide intent let
 *  the view argue with itself. Only the user's own gestures and explicit jumps
 *  move intent; metrics only decide where a *released* gesture leaves us.
 */
export function useMobileNativeChatTailFollow<TItem>(args: {
  /** Guards `scrollToEnd` against an empty list. */
  hasItems: boolean
}): MobileNativeChatTailFollow<TItem> {
  const { hasItems } = args
  const listRef = useRef<FlatList<TItem> | null>(null)
  const [following, setFollowingFlag] = useState(true)
  const [atTail, setAtTailFlag] = useState(true)
  // Event handlers read intent at event time, before a re-render lands.
  const followingRef = useRef(true)
  const atTailRef = useRef(true)
  const userScrollActiveRef = useRef(false)
  const userScrollSettleFrameRef = useRef<number | null>(null)

  // Single writer, so the event-time ref and the render flag cannot disagree.
  const setFollowing = useCallback((next: boolean) => {
    if (followingRef.current === next) {
      return
    }
    followingRef.current = next
    setFollowingFlag(next)
  }, [])

  const setAtTail = useCallback((next: boolean) => {
    if (atTailRef.current === next) {
      return
    }
    atTailRef.current = next
    setAtTailFlag(next)
  }, [])

  const pinToTail = useCallback(() => {
    if (!followingRef.current || !hasItems) {
      return
    }
    listRef.current?.scrollToEnd({ animated: false })
  }, [hasItems])

  const pinToTailAfterContentResize = useCallback(
    (_width: number, height: number) => {
      if (!followingRef.current || !hasItems) {
        return
      }
      listRef.current?.scrollToOffset({ animated: false, offset: height })
    },
    [hasItems]
  )

  const clearUserScrollSettle = useCallback(() => {
    if (userScrollSettleFrameRef.current !== null) {
      cancelAnimationFrame(userScrollSettleFrameRef.current)
      userScrollSettleFrameRef.current = null
    }
  }, [])

  const recordScrollMetrics = useCallback(
    (event: NativeScrollEvent) => setAtTail(isAtTail(event)),
    [setAtTail]
  )

  const jumpToTail = useCallback(() => {
    clearUserScrollSettle()
    userScrollActiveRef.current = false
    setAtTail(true)
    setFollowing(true)
    pinToTail()
  }, [clearUserScrollSettle, pinToTail, setAtTail, setFollowing])

  const beginUserScroll = useCallback(() => {
    clearUserScrollSettle()
    userScrollActiveRef.current = true
    setFollowing(false)
  }, [clearUserScrollSettle, setFollowing])

  const finishUserScroll = useCallback(
    (finishedAtTail: boolean) => {
      if (!userScrollActiveRef.current) {
        return
      }
      clearUserScrollSettle()
      userScrollActiveRef.current = false
      setAtTail(finishedAtTail)
      setFollowing(finishedAtTail)
      if (finishedAtTail) {
        pinToTail()
      }
    },
    [clearUserScrollSettle, pinToTail, setAtTail, setFollowing]
  )

  const endUserDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!userScrollActiveRef.current) {
        return
      }
      clearUserScrollSettle()
      const releasedAtTail = isAtTail(event.nativeEvent)
      userScrollSettleFrameRef.current = requestAnimationFrame(() => {
        userScrollSettleFrameRef.current = null
        finishUserScroll(releasedAtTail)
      })
    },
    [clearUserScrollSettle, finishUserScroll]
  )

  const beginMomentum = useCallback(() => {
    if (userScrollActiveRef.current) {
      clearUserScrollSettle()
    }
  }, [clearUserScrollSettle])

  const endMomentum = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      finishUserScroll(isAtTail(event.nativeEvent)),
    [finishUserScroll]
  )

  const detachFromTail = useCallback(() => {
    clearUserScrollSettle()
    userScrollActiveRef.current = false
    setAtTail(false)
    setFollowing(false)
  }, [clearUserScrollSettle, setAtTail, setFollowing])

  useEffect(() => clearUserScrollSettle, [clearUserScrollSettle])

  const listProps = useMemo(
    () => ({
      onScrollBeginDrag: beginUserScroll,
      onScrollEndDrag: endUserDrag,
      onMomentumScrollBegin: beginMomentum,
      onMomentumScrollEnd: endMomentum,
      onContentSizeChange: pinToTailAfterContentResize,
      onLayout: pinToTail,
      maintainVisibleContentPosition: MAINTAIN_VISIBLE_CONTENT
    }),
    [
      beginUserScroll,
      endUserDrag,
      beginMomentum,
      endMomentum,
      pinToTailAfterContentResize,
      pinToTail
    ]
  )

  return {
    listRef,
    showJumpToTail: !following && !atTail,
    pinToTail,
    pinToTailAfterContentResize,
    jumpToTail,
    beginUserScroll,
    endUserDrag,
    beginMomentum,
    endMomentum,
    detachFromTail,
    recordScrollMetrics,
    listProps
  }
}
