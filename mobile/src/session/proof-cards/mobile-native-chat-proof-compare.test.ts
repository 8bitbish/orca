import { describe, expect, it } from 'vitest'
import { imageThumbnailFrame } from '../../../../src/shared/image-thumbnail-frame'
import {
  mobileNativeChatProofAspect,
  mobileNativeChatProofCompareBox,
  mobileNativeChatProofCompareClaimsDrag,
  mobileNativeChatProofComparePosition,
  mobileNativeChatProofCompareTapSide,
  mobileNativeChatProofPressX,
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

describe('proof compare tap and frame', () => {
  it('leaves a tap that barely moved to the tap, and takes a real sideways drag', () => {
    expect(mobileNativeChatProofCompareClaimsDrag(3, 0)).toBe(false)
    expect(mobileNativeChatProofCompareClaimsDrag(-5, 1)).toBe(false)
    expect(mobileNativeChatProofCompareClaimsDrag(6, 2)).toBe(true)
  })

  it('opens the side of the divider a tap landed on', () => {
    expect(mobileNativeChatProofCompareTapSide(100, 340, 50)).toBe('before')
    expect(mobileNativeChatProofCompareTapSide(240, 340, 50)).toBe('after')
    expect(mobileNativeChatProofCompareTapSide(100, 340, 20)).toBe('after')
  })

  it('reads where a press landed on the phone and in the web build', () => {
    expect(mobileNativeChatProofPressX({ locationX: 42, pageX: 300 })).toBe(42)
    expect(mobileNativeChatProofPressX({ offsetX: 17, clientX: 300 })).toBe(17)
    expect(mobileNativeChatProofPressX({})).toBeNaN()
  })

  it('keeps the slider one height whatever the image, never wider than the card', () => {
    const box = mobileNativeChatProofCompareBox(340)
    const tall = { width: 340, height: 360, fit: 'top', tall: true }
    expect(imageThumbnailFrame(1481, 4000, box)).toEqual(tall)
    expect(imageThumbnailFrame(1170, 2532, box)).toMatchObject({ width: 200, height: 360 })
    expect(imageThumbnailFrame(1600, 1000, box)).toMatchObject({ width: 340, height: 360 })
    expect(mobileNativeChatProofCompareBox(120)).toMatchObject({ minWidth: 120, maxWidth: 120 })
  })
})
