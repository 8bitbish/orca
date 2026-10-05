import { describe, expect, it } from 'vitest'
import { imageThumbnailFrame, isTallImage } from './image-thumbnail-frame'

const BOX = { height: 176, minWidth: 128, maxWidth: 320 }

describe('imageThumbnailFrame', () => {
  it('keeps the same height whatever the shape', () => {
    for (const [width, height] of [
      [1481, 4000],
      [1534, 3600],
      [1170, 2532],
      [1920, 1080],
      [4000, 200],
      [null, null]
    ] as const) {
      expect(imageThumbnailFrame(width, height, BOX).height).toBe(176)
    }
  })

  it('crops a tall board to its top in the widest frame', () => {
    expect(imageThumbnailFrame(1481, 4000, BOX)).toEqual({
      width: 320,
      height: 176,
      fit: 'top',
      tall: true
    })
    expect(imageThumbnailFrame(1534, 3600, BOX).fit).toBe('top')
  })

  it('shows a phone screen or a wide shot whole, within the width bounds', () => {
    expect(imageThumbnailFrame(1170, 2532, BOX)).toEqual({
      width: 128,
      height: 176,
      fit: 'contain',
      tall: false
    })
    expect(imageThumbnailFrame(1920, 1080, BOX).width).toBe(313)
    expect(imageThumbnailFrame(4000, 200, BOX).width).toBe(320)
    expect(imageThumbnailFrame(null, undefined, BOX).width).toBe(282)
  })

  it('calls an image tall only past the phone-screen ratio', () => {
    expect(isTallImage(1080, 2400)).toBe(false)
    expect(isTallImage(1000, 2300)).toBe(true)
    expect(isTallImage(0, 2300)).toBe(false)
    expect(isTallImage(null, 2300)).toBe(false)
  })
})
