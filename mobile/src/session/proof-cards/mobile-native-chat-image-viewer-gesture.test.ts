import { describe, expect, it } from 'vitest'
import {
  imageZoomFitView,
  panImageView,
  zoomImageViewAt
} from '../../../../src/shared/image-zoom-pan'
import {
  IMAGE_VIEWER_DOUBLE_TAP_MS,
  imageViewerTapAction,
  moveImageViewerGesture,
  startImageViewerGesture
} from './mobile-native-chat-image-viewer-gesture'

// A tall board export on a phone-sized viewport.
const IMAGE = { width: 1481, height: 4000 }
const VIEWPORT = { width: 390, height: 844 }
const FIT = imageZoomFitView(IMAGE, VIEWPORT)
const at = (x: number, y: number) => ({ x, y })

describe('image viewer gestures', () => {
  it('pinches around the fingers’ centre with the shared zoom maths', () => {
    const start = startImageViewerGesture(FIT, [at(150, 400), at(250, 400)])
    const { view, gesture } = moveImageViewerGesture(
      start,
      [at(100, 400), at(300, 400)],
      IMAGE,
      VIEWPORT
    )
    expect(view).toEqual(zoomImageViewAt(FIT, FIT.scale * 2, at(200, 400), IMAGE, VIEWPORT))
    expect(view.scale).toBeCloseTo(FIT.scale * 2, 6)
    expect(gesture.moved).toBe(true)
  })

  it('pans with one finger once zoomed, within the shared pan limits', () => {
    const zoomed = zoomImageViewAt(FIT, 1, at(195, 422), IMAGE, VIEWPORT)
    const start = startImageViewerGesture(zoomed, [at(200, 400)])
    const { view } = moveImageViewerGesture(start, [at(160, 300)], IMAGE, VIEWPORT)
    expect(view).toEqual(panImageView(zoomed, -40, -100, IMAGE, VIEWPORT))
    expect(view).not.toEqual(zoomed)
  })

  it('does not pan an image sitting at fit', () => {
    const start = startImageViewerGesture(FIT, [at(200, 400)])
    expect(moveImageViewerGesture(start, [at(260, 300)], IMAGE, VIEWPORT).view).toEqual(FIT)
  })

  it('re-bases when a second finger lands, keeping the tap origin and marking it moved', () => {
    const one = startImageViewerGesture(FIT, [at(200, 400)])
    const two = startImageViewerGesture(FIT, [at(200, 400), at(260, 400)], one)
    expect(two.origin).toEqual(at(200, 400))
    expect(two.moved).toBe(true)
    expect(two.touches).toHaveLength(2)
  })

  it('counts a still touch as a tap and a long drag as a move', () => {
    const start = startImageViewerGesture(FIT, [at(200, 400)])
    const still = moveImageViewerGesture(start, [at(203, 402)], IMAGE, VIEWPORT)
    const dragged = moveImageViewerGesture(start, [at(200, 440)], IMAGE, VIEWPORT)
    expect(still.gesture.moved).toBe(false)
    expect(dragged.gesture.moved).toBe(true)
  })

  it('double-tap toggles fit and 100% around the tap', () => {
    const first = { at: at(195, 300), time: 1000 }
    const second = { at: at(198, 302), time: 1000 + IMAGE_VIEWER_DOUBLE_TAP_MS - 50 }
    expect(imageViewerTapAction(FIT, first, null, IMAGE, VIEWPORT)).toEqual({ action: 'none' })
    const zoomed = imageViewerTapAction(FIT, second, first, IMAGE, VIEWPORT)
    expect(zoomed).toMatchObject({ action: 'toggle', view: { scale: 1 } })
    const back = imageViewerTapAction(
      zoomed.action === 'toggle' ? zoomed.view : FIT,
      { at: second.at, time: 2000 },
      { at: second.at, time: 1900 },
      IMAGE,
      VIEWPORT
    )
    expect(back).toEqual({ action: 'toggle', view: FIT })
  })

  it('closes on a tap beside the image at fit, but not once zoomed', () => {
    // At fit the board is 312 wide and centred, so x=20 is beside it.
    const beside = { at: at(20, 400), time: 0 }
    expect(imageViewerTapAction(FIT, beside, null, IMAGE, VIEWPORT)).toEqual({ action: 'close' })
    const zoomed = zoomImageViewAt(FIT, 1, at(195, 422), IMAGE, VIEWPORT)
    expect(imageViewerTapAction(zoomed, beside, null, IMAGE, VIEWPORT)).toEqual({ action: 'none' })
  })

  it('ignores a slow second tap', () => {
    const first = { at: at(195, 300), time: 0 }
    const late = { at: at(195, 300), time: IMAGE_VIEWER_DOUBLE_TAP_MS + 1 }
    expect(imageViewerTapAction(FIT, late, first, IMAGE, VIEWPORT)).toEqual({ action: 'none' })
  })
})
