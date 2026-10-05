import { describe, expect, it } from 'vitest'
import {
  clampImageZoomView,
  IMAGE_ZOOM_MAX_SCALE,
  imageZoomFillScale,
  imageZoomFitScale,
  imageZoomFitView,
  imageZoomFitWidthScale,
  imageZoomPinchScale,
  imageZoomScaleBounds,
  imageZoomWheelFactor,
  imageZoomWheelPixels,
  isImageZoomAtFit,
  panImageView,
  rescaleImageViewForSource,
  toggleImageZoomAt,
  zoomImageViewAt,
  zoomImageViewBy
} from './image-zoom-pan'

const TALL = { width: 1481, height: 4000 }
const SCREEN = { width: 1000, height: 800 }

describe('image zoom fits', () => {
  it('fits the whole image without enlarging a small one', () => {
    expect(imageZoomFitScale(TALL, SCREEN)).toBeCloseTo(0.2)
    expect(imageZoomFitScale({ width: 100, height: 50 }, SCREEN)).toBe(1)
  })

  it('fits the width, and fills the viewport', () => {
    expect(imageZoomFitWidthScale(TALL, SCREEN)).toBeCloseTo(1000 / 1481)
    expect(imageZoomFillScale(TALL, SCREEN)).toBeCloseTo(1000 / 1481)
    expect(imageZoomFillScale({ width: 2000, height: 400 }, SCREEN)).toBe(2)
  })

  it('treats unusable sizes as 1:1 rather than NaN', () => {
    expect(imageZoomFitScale({ width: 0, height: 10 }, SCREEN)).toBe(1)
    expect(imageZoomFitWidthScale(TALL, { width: Number.NaN, height: 1 })).toBe(1)
    expect(clampImageZoomView({ scale: 2, x: 5, y: 5 }, TALL, { width: 0, height: 0 })).toEqual({
      scale: 1,
      x: 0,
      y: 0
    })
  })

  it('centres a fit view, and starts a fit-width view at the top', () => {
    const fit = imageZoomFitView(TALL, SCREEN)
    expect(fit.scale).toBeCloseTo(0.2)
    expect(fit.y).toBeCloseTo(0)
    expect(fit.x).toBeCloseTo((1000 - 1481 * 0.2) / 2)
    const width = imageZoomFitView(TALL, SCREEN, 'width')
    expect(width).toMatchObject({ x: 0, y: 0 })
    expect(width.scale).toBeCloseTo(1000 / 1481)
    expect(imageZoomFitView(TALL, SCREEN, 'actual')).toEqual({ scale: 1, x: 0, y: 0 })
  })
})

describe('image zoom bounds', () => {
  it('zooms out no further than fit and in to 800%', () => {
    const bounds = imageZoomScaleBounds(TALL, SCREEN)
    expect(bounds.min).toBeCloseTo(0.2)
    expect(bounds.max).toBe(IMAGE_ZOOM_MAX_SCALE)
    expect(clampImageZoomView({ scale: 0.01, x: 0, y: 0 }, TALL, SCREEN).scale).toBeCloseTo(0.2)
    expect(clampImageZoomView({ scale: 99, x: 0, y: 0 }, TALL, SCREEN).scale).toBe(8)
  })

  it('keeps the viewport covered once the image is larger, and centres it while smaller', () => {
    const at1 = { scale: 1, x: 0, y: 0 }
    expect(panImageView(at1, 500, 500, TALL, SCREEN)).toEqual({ scale: 1, x: 0, y: 0 })
    expect(panImageView(at1, -5000, -9000, TALL, SCREEN)).toEqual({
      scale: 1,
      x: 1000 - 1481,
      y: 800 - 4000
    })
    expect(panImageView(at1, -100, -250, TALL, SCREEN)).toEqual({ scale: 1, x: -100, y: -250 })
    const small = { width: 200, height: 100 }
    expect(panImageView(at1, 300, 300, small, SCREEN)).toEqual({ scale: 1, x: 400, y: 350 })
  })
})

describe('image zoom around a point', () => {
  it('keeps the image point under the anchor still', () => {
    const view = { scale: 1, x: -200, y: -1000 }
    const anchor = { x: 300, y: 400 }
    const imageX = (anchor.x - view.x) / view.scale
    const imageY = (anchor.y - view.y) / view.scale
    const next = zoomImageViewAt(view, 2, anchor, TALL, SCREEN)
    expect(next.scale).toBe(2)
    expect((anchor.x - next.x) / next.scale).toBeCloseTo(imageX)
    expect((anchor.y - next.y) / next.scale).toBeCloseTo(imageY)
  })

  it('zooms by a factor around the centre by default', () => {
    const view = imageZoomFitView(TALL, SCREEN, 'actual')
    const next = zoomImageViewBy(view, 1.25, TALL, SCREEN)
    expect(next.scale).toBeCloseTo(1.25)
    expect(next.x).toBeCloseTo(500 - 500 * 1.25)
  })

  it('toggles between fit and actual pixels, and back', () => {
    const fit = imageZoomFitView(TALL, SCREEN)
    expect(isImageZoomAtFit(fit, TALL, SCREEN)).toBe(true)
    const zoomed = toggleImageZoomAt(fit, { x: 500, y: 100 }, TALL, SCREEN)
    expect(zoomed.scale).toBe(1)
    expect(isImageZoomAtFit(zoomed, TALL, SCREEN)).toBe(false)
    expect(toggleImageZoomAt(zoomed, { x: 0, y: 0 }, TALL, SCREEN)).toEqual(fit)
    const small = { width: 200, height: 100 }
    const smallFit = imageZoomFitView(small, SCREEN)
    expect(toggleImageZoomAt(smallFit, { x: 500, y: 400 }, small, SCREEN).scale).toBe(2)
  })

  it('keeps the view when a thumbnail is swapped for the full image', () => {
    const thumb = { width: 881, height: 2379 }
    const view = { scale: 1.5, x: -50, y: -300 }
    const next = rescaleImageViewForSource(view, thumb, TALL, SCREEN)
    expect(next.scale).toBeCloseTo((1.5 * 881) / 1481)
    expect(next).toMatchObject({ x: -50, y: -300 })
  })
})

describe('image zoom input', () => {
  it('normalises wheel deltas to pixels', () => {
    expect(imageZoomWheelPixels(3, 1)).toBe(48)
    expect(imageZoomWheelPixels(1, 2)).toBe(800)
    expect(imageZoomWheelPixels(12, 0)).toBe(12)
    expect(imageZoomWheelPixels(Number.NaN, 0)).toBe(0)
  })

  it('turns a pinch (ctrl-wheel) into a bounded zoom factor', () => {
    expect(imageZoomWheelFactor(0, 0)).toBe(1)
    expect(imageZoomWheelFactor(-10, 0)).toBeGreaterThan(1)
    expect(imageZoomWheelFactor(10, 0)).toBeLessThan(1)
    expect(imageZoomWheelFactor(-10_000, 0)).toBeCloseTo(Math.exp(200 / 300))
  })

  it('scales a touch pinch by the change in finger spread', () => {
    expect(imageZoomPinchScale(0.5, 100, 300)).toBe(1.5)
    expect(imageZoomPinchScale(0.5, 0, 300)).toBe(0.5)
  })
})
