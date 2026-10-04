// The before/after slider's arithmetic, kept apart from the gesture so it can be tested.

export const MOBILE_NATIVE_CHAT_PROOF_COMPARE_START = 50
/** How far one accessibility increment moves the divider, in percent. */
export const MOBILE_NATIVE_CHAT_PROOF_COMPARE_STEP = 10
const DEFAULT_ASPECT = 16 / 10

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/** The divider's position, in percent of the frame, for a touch `x` points from its left edge. */
export function mobileNativeChatProofComparePosition(x: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(x)) {
    return MOBILE_NATIVE_CHAT_PROOF_COMPARE_START
  }
  return clampPercent((x / width) * 100)
}

/** Whether a drag that started on the slider is the slider's: horizontal ones are, while
 *  vertical ones (and a touch that has not moved) stay with the chat's scrolling. */
export function mobileNativeChatProofCompareClaimsDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > Math.abs(dy)
}

/** One screen-reader swipe up or down on the slider. */
export function stepMobileNativeChatProofComparePosition(
  position: number,
  direction: 'increment' | 'decrement'
): number {
  const step =
    direction === 'increment'
      ? MOBILE_NATIVE_CHAT_PROOF_COMPARE_STEP
      : -MOBILE_NATIVE_CHAT_PROOF_COMPARE_STEP
  return clampPercent(Math.round(position + step))
}

/** Width over height from an image's size; 16:10 until it is known. */
export function mobileNativeChatProofAspect(width?: number | null, height?: number | null): number {
  return width && height && width > 0 && height > 0 ? width / height : DEFAULT_ASPECT
}

/** The largest frame of `aspect` that fits the card's width and the height cap. */
export function mobileNativeChatProofFrame(
  aspect: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (!(maxWidth > 0) || !(aspect > 0)) {
    return { width: 0, height: 0 }
  }
  const height = Math.min(maxHeight, maxWidth / aspect)
  return { width: Math.round(height * aspect), height: Math.round(height) }
}
