import { describe, expect, it } from 'vitest'
import {
  mobileNativeChatProofAspect,
  mobileNativeChatProofCompareClaimsDrag,
  mobileNativeChatProofComparePosition,
  mobileNativeChatProofFrame,
  stepMobileNativeChatProofComparePosition
} from './mobile-native-chat-proof-compare'

describe('proof compare slider maths', () => {
  it('turns a touch into a percent of the frame, clamped to its edges', () => {
    expect(mobileNativeChatProofComparePosition(160, 320)).toBe(50)
    expect(mobileNativeChatProofComparePosition(80, 320)).toBe(25)
    expect(mobileNativeChatProofComparePosition(-40, 320)).toBe(0)
    expect(mobileNativeChatProofComparePosition(400, 320)).toBe(100)
  })

  it('stays centred before the frame has a width', () => {
    expect(mobileNativeChatProofComparePosition(10, 0)).toBe(50)
    expect(mobileNativeChatProofComparePosition(Number.NaN, 320)).toBe(50)
  })

  it('takes horizontal drags and leaves vertical ones and still touches to the chat', () => {
    expect(mobileNativeChatProofCompareClaimsDrag(12, 3)).toBe(true)
    expect(mobileNativeChatProofCompareClaimsDrag(-12, 3)).toBe(true)
    expect(mobileNativeChatProofCompareClaimsDrag(3, 40)).toBe(false)
    expect(mobileNativeChatProofCompareClaimsDrag(0, 0)).toBe(false)
  })

  it('steps by ten for screen readers and stops at the ends', () => {
    expect(stepMobileNativeChatProofComparePosition(50, 'increment')).toBe(60)
    expect(stepMobileNativeChatProofComparePosition(5, 'decrement')).toBe(0)
    expect(stepMobileNativeChatProofComparePosition(95, 'increment')).toBe(100)
  })

  it('reads the aspect from the image, 16:10 until it is known', () => {
    expect(mobileNativeChatProofAspect(1170, 2532)).toBeCloseTo(0.462, 3)
    expect(mobileNativeChatProofAspect(undefined, 100)).toBe(1.6)
    expect(mobileNativeChatProofAspect(null, null)).toBe(1.6)
  })

  it('fits a wide shot to the card width and a tall one to the height cap', () => {
    expect(mobileNativeChatProofFrame(1.6, 320, 400)).toEqual({ width: 320, height: 200 })
    expect(mobileNativeChatProofFrame(0.5, 320, 400)).toEqual({ width: 200, height: 400 })
    expect(mobileNativeChatProofFrame(1.6, 0, 400)).toEqual({ width: 0, height: 0 })
  })
})
