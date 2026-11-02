import { imageZoomWheelFactor, imageZoomWheelPixels } from '../../../../shared/image-zoom-pan'

export const IMAGE_VIEWER_ZOOM_STEP = 1.25

export function shouldHandleImageZoomWheel(event: { ctrlKey: boolean }): boolean {
  return event.ctrlKey
}

export function getWheelDeltaPixels(delta: number, deltaMode: number): number {
  return imageZoomWheelPixels(delta, deltaMode)
}

export function getPinchZoomFactor(deltaY: number, deltaMode: number): number {
  return imageZoomWheelFactor(deltaY, deltaMode)
}
