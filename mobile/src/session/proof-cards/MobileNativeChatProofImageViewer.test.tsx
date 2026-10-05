import { createElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatProofMedia } from '../../../../src/shared/native-chat-proof-card-payload'
import {
  MobileNativeChatProofMediaContext,
  type MobileNativeChatProofMediaSource
} from './mobile-native-chat-proof-context'
import type { MobileNativeChatProofMediaLoader } from './mobile-native-chat-proof-media-loader'
import { MobileNativeChatProofViewer } from './MobileNativeChatProofMedia'

vi.mock('react-native', () => ({
  Animated: {
    Value: class {
      constructor(public value: number) {}
    },
    timing: () => ({}),
    sequence: () => ({}),
    loop: () => ({ start: () => {}, stop: () => {} }),
    View: 'AnimatedView'
  },
  Image: 'Image',
  Modal: 'Modal',
  // The handlers land on the view as props, so a test can drive them directly.
  PanResponder: { create: (config: object) => ({ panHandlers: config }) },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: {
    create: (styles: unknown) => styles,
    hairlineWidth: 1,
    absoluteFill: {},
    absoluteFillObject: {}
  },
  Text: 'Text',
  View: 'View'
}))
vi.mock('react-native-svg', () => ({
  default: 'Svg',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Rect: 'Rect',
  Stop: 'Stop'
}))
vi.mock('lucide-react-native', () => ({
  ChevronsLeftRight: 'ChevronsLeftRight',
  ImageOff: 'ImageOff',
  Maximize2: 'Maximize2',
  VideoOff: 'VideoOff',
  X: 'X'
}))
vi.mock('expo-video', () => ({ VideoView: 'VideoView', useVideoPlayer: () => ({}) }))

// Made-up files: a tall board export (sent at the host's ~2 MP cap) and a pair.
const SIZES: Record<string, [number, number]> = {
  'board.png': [881, 2379],
  'before.png': [1000, 625],
  'after.png': [1000, 625]
}
const BOARD: NativeChatProofMedia = {
  type: 'image',
  source: 'demo/board.png',
  path: 'demo/board.png',
  caption: 'Board'
}
const BEFORE: NativeChatProofMedia = {
  type: 'image',
  source: 'demo/before.png',
  path: 'demo/before.png',
  role: 'before'
}
const AFTER: NativeChatProofMedia = {
  ...BEFORE,
  source: 'demo/after.png',
  path: 'demo/after.png',
  role: 'after'
}

function loader(): MobileNativeChatProofMediaLoader {
  const name = (path: string): string => path.split('/').pop() ?? path
  return {
    loadFile: vi.fn<MobileNativeChatProofMediaLoader['loadFile']>(async (path) => ({
      ok: true,
      uri: `file:///cache/${name(path)}`,
      mimeType: 'image/png'
    })),
    loadThumbnail: vi.fn<MobileNativeChatProofMediaLoader['loadThumbnail']>(async (path) => {
      const [width, height] = SIZES[name(path)]
      const image = { src: `thumb:${name(path)}`, mimeType: 'image/png' as const, width, height }
      return { ok: true, image: { ...image, byteLength: 1 } }
    })
  }
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function render(media: readonly NativeChatProofMedia[]): Promise<ReactTestRenderer> {
  const source: MobileNativeChatProofMediaSource = { status: 'supported', loader: loader() }
  await act(async () => {
    renderer = create(
      createElement(
        MobileNativeChatProofMediaContext.Provider,
        { value: source },
        createElement(MobileNativeChatProofViewer, { media })
      )
    )
  })
  return renderer!
}

function layOut(root: ReactTestRenderer, width: number, height: number): void {
  const layout = { nativeEvent: { layout: { x: 0, y: 0, width, height } } }
  for (const node of root.root.findAll((n) => typeof n.props.onLayout === 'function')) {
    act(() => node.props.onLayout(layout))
  }
}

const find = (root: ReactTestRenderer, test: (node: ReactTestInstance) => boolean) =>
  root.root.findAll((node) => typeof node.type === 'string' && test(node))
const byLabel = (root: ReactTestRenderer, label: string) =>
  find(root, (node) => node.props.accessibilityLabel === label)
const modals = (root: ReactTestRenderer) => find(root, (node) => String(node.type) === 'Modal')
const viewerLabel = (root: ReactTestRenderer) =>
  find(root, (node) => node.props.accessibilityHint === 'Pinch to zoom, double-tap for 100%').map(
    (node) => node.props.accessibilityLabel
  )
const styleOf = (node: ReactTestInstance) => Object.assign({}, ...[node.props.style].flat())

let clock = 0
/** A touch event at these points in the viewer, 100 ms after the last one. */
function touches(...points: [number, number][]) {
  clock += 100
  const fingers = points.map(([locationX, locationY]) => ({ locationX, locationY }))
  return { nativeEvent: { touches: fingers, timestamp: clock } }
}

function texts(root: ReactTestRenderer): string {
  return root.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => node.children.filter((child) => typeof child === 'string').join(''))
    .join('|')
}

describe('proof image thumbnails and full-screen viewer', () => {
  it('keeps a tall image in a normal-height strip tile, cropped to its top with a cue', async () => {
    const root = await render([BOARD])
    const [tile] = byLabel(root, 'Board, show full size')
    expect(styleOf(tile)).toMatchObject({ width: 320, height: 176 })
    expect(texts(root)).toContain('Tall image, tap to see it all')
    const [image] = find(root, (node) => String(node.type) === 'Image')
    // Filling the 320 width keeps the board's shape; the frame clips the rest.
    expect(styleOf(image)).toMatchObject({ width: 320, height: 864 })
  })

  it('opens the strip image full screen and closes with the X or Android back', async () => {
    const root = await render([BOARD])
    await act(async () => byLabel(root, 'Board, show full size')[0].props.onPress())
    expect(modals(root)).toHaveLength(1)
    act(() => byLabel(root, 'Close')[0].props.onPress())
    expect(modals(root)).toHaveLength(0)

    await act(async () => byLabel(root, 'Board, show full size')[0].props.onPress())
    act(() => modals(root)[0].props.onRequestClose())
    expect(modals(root)).toHaveLength(0)
  })

  it('pinches, pans, double-taps and closes on a tap beside the image', async () => {
    const root = await render([BOARD])
    await act(async () => byLabel(root, 'Board, show full size')[0].props.onPress())
    layOut(root, 390, 844)
    const [surface] = byLabel(root, 'Board')
    const full = () =>
      styleOf(
        find(root, (node) => String(node.type) === 'Image' && node.props.onLoad !== undefined)[0]
      )
    // Fit: the board is 844 tall, centred across.
    expect(full().height).toBeCloseTo(844, 0)

    act(() => surface.props.onPanResponderGrant(touches([150, 400], [250, 400])))
    act(() => surface.props.onPanResponderMove(touches([100, 400], [300, 400])))
    act(() => surface.props.onPanResponderRelease(touches()))
    const pinched = full()
    expect(pinched.height).toBeCloseTo(844 * 2, 0)

    act(() => surface.props.onPanResponderGrant(touches([200, 400])))
    act(() => surface.props.onPanResponderMove(touches([200, 300])))
    act(() => surface.props.onPanResponderRelease(touches()))
    expect(full().top).toBeCloseTo(pinched.top - 100, 0)

    // Double-tap goes back to fit; then a tap beside the narrow board closes.
    for (let tap = 0; tap < 2; tap += 1) {
      act(() => surface.props.onPanResponderGrant(touches([195, 400])))
      act(() => surface.props.onPanResponderRelease(touches()))
    }
    expect(full().height).toBeCloseTo(844, 0)
    act(() => surface.props.onPanResponderGrant(touches([10, 400])))
    act(() => surface.props.onPanResponderRelease(touches()))
    expect(modals(root)).toHaveLength(0)
  })

  it('opens the slider side a tap lands on, and switches sides in the viewer', async () => {
    const root = await render([BEFORE, AFTER])
    // Twice: the card's width first, then the slider that appears at that width.
    layOut(root, 340, 360)
    layOut(root, 340, 360)
    const [tap] = root.root.findAll((node) => node.props.testID === 'proof-compare-tap')
    await act(async () => tap.props.onPress({ nativeEvent: { locationX: 60 } }))
    expect(viewerLabel(root)).toEqual(['Before: before.png'])
    const after = find(root, (node) => node.props.accessibilityRole === 'tab')[1]
    await act(async () => after.props.onPress())
    expect(viewerLabel(root)).toEqual(['After: after.png'])
    act(() => byLabel(root, 'Close')[0].props.onPress())
    expect(modals(root)).toHaveLength(0)

    await act(async () => tap.props.onPress({ nativeEvent: { locationX: 300 } }))
    expect(viewerLabel(root)).toEqual(['After: after.png'])
  })

  it('drags the divider without opening anything, and keeps a fixed frame', async () => {
    const root = await render([BEFORE, AFTER])
    layOut(root, 340, 360)
    layOut(root, 340, 360)
    const [slider] = find(root, (node) => node.props.accessibilityRole === 'adjustable')
    expect(slider.props.onMoveShouldSetPanResponderCapture(null, { dx: 3, dy: 0 })).toBe(false)
    expect(slider.props.onMoveShouldSetPanResponderCapture(null, { dx: 10, dy: 2 })).toBe(true)
    act(() => slider.props.onPanResponderGrant({ nativeEvent: { locationX: 180 } }, { dx: 10 }))
    act(() => slider.props.onPanResponderMove({}, { dx: 70 }))
    const [moved] = find(root, (node) => node.props.accessibilityRole === 'adjustable')
    expect(moved.props.accessibilityValue.now).toBe(Math.round((240 / 340) * 100))
    expect(modals(root)).toHaveLength(0)
    expect(styleOf(moved.parent!)).toMatchObject({ width: 340, height: 360 })
  })
})
