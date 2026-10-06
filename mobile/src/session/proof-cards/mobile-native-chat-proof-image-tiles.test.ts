import { describe, expect, it } from 'vitest'
import {
  NO_PROOF_TILES_DRAWN,
  nextProofTilesDrawn,
  proofTileLoaded,
  proofBaseBitmapWidth,
  proofImageDisplayRect,
  proofTileCovers,
  proofTileNeed,
  proofTilePlacement,
  type ProofTile,
  type ProofTileCell
} from './mobile-native-chat-proof-image-tiles'

// A made-up 6000 px board shown from its 1000 px thumbnail on a 400 × 800 pt phone.
const SOURCE = { width: 6000, height: 6000 }
const IMAGE = { width: 1000, height: 1000 }
const VIEWPORT = { width: 400, height: 800 }
// 2× fit, panned into the middle: drawn 2000 pt square at (-500, -600), 3 source px per pt.
const ZOOMED = { scale: 2, x: -500, y: -600 }

function tileFor(cell: ProofTileCell, overrides: Partial<ProofTile> = {}): ProofTile {
  return {
    path: 'demo/board.png',
    x: cell.x,
    y: cell.y,
    width: cell.width,
    height: cell.height,
    sourceWidth: SOURCE.width,
    sourceHeight: SOURCE.height,
    outputWidth: cell.maxWidth,
    outputHeight: Math.round((cell.height * cell.maxWidth) / cell.width),
    requestedScale: cell.maxWidth / cell.width,
    uri: 'data:image/jpeg;base64,AAAA',
    ...overrides
  }
}

describe('proof image tile maths', () => {
  it('needs nothing at fit, where the base bitmap already covers the device pixels', () => {
    const fit = { scale: 0.4, x: 0, y: 200 }
    expect(
      proofTileNeed({
        view: fit,
        image: IMAGE,
        viewport: VIEWPORT,
        source: SOURCE,
        pixelRatio: 2.5
      })
    ).toBeNull()
  })

  it('needs nothing when the source has no more pixels than the base bitmap', () => {
    const small = { width: 1000, height: 1000 }
    expect(
      proofTileNeed({
        view: ZOOMED,
        image: IMAGE,
        viewport: VIEWPORT,
        source: small,
        pixelRatio: 3
      })
    ).toBeNull()
  })

  it('caps the base bitmap at what Android decodes', () => {
    expect(proofBaseBitmapWidth({ width: 6000, height: 6000 }, SOURCE)).toBe(2048)
    expect(proofBaseBitmapWidth(IMAGE, SOURCE)).toBe(1000)
    expect(proofBaseBitmapWidth({ width: 3000, height: 6000 }, { width: 3000, height: 6000 })).toBe(
      1024
    )
  })

  it('turns the viewport into a source rectangle with a margin, split under 2048 px a side', () => {
    const need = proofTileNeed({
      view: ZOOMED,
      image: IMAGE,
      viewport: VIEWPORT,
      source: SOURCE,
      pixelRatio: 3
    })
    expect(need?.visible).toEqual({ x: 1500, y: 1800, width: 1200, height: 2400 })
    // 10% each side: 1380…2820 across, 1560…4440 down; 2880 device px tall makes two rows,
    // the first overlapping the second by 2 px.
    expect(need?.cells).toEqual([
      { x: 1380, y: 1560, width: 1440, height: 1442, maxWidth: 1440 },
      { x: 1380, y: 3000, width: 1440, height: 1440, maxWidth: 1440 }
    ])
  })

  it('asks for the device pixel width, never more than the source has', () => {
    const at = (pixelRatio: number) =>
      proofTileNeed({ view: ZOOMED, image: IMAGE, viewport: VIEWPORT, source: SOURCE, pixelRatio })
    // 2000 pt × 1.5 = 3000 device px for 6000 source px: half detail, one 720 × 1440 cell.
    expect(at(1.5)?.cells).toEqual([{ x: 1380, y: 1560, width: 1440, height: 2880, maxWidth: 720 }])
    // Past 1:1 the host serves source pixels as they are.
    expect(at(6)?.cells.map((cell) => cell.maxWidth)).toEqual([1440, 1440])
  })

  it('clamps the rectangle and its margin to the image edges', () => {
    const corner = { scale: 2, x: 0, y: 0 }
    const need = proofTileNeed({
      view: corner,
      image: IMAGE,
      viewport: VIEWPORT,
      source: SOURCE,
      pixelRatio: 1.5
    })
    expect(need?.visible).toEqual({ x: 0, y: 0, width: 1200, height: 2400 })
    expect(need?.cells).toEqual([{ x: 0, y: 0, width: 1320, height: 2640, maxWidth: 660 }])

    const end = { scale: 2, x: 400 - 2000, y: 800 - 2000 }
    const last = proofTileNeed({
      view: end,
      image: IMAGE,
      viewport: VIEWPORT,
      source: SOURCE,
      pixelRatio: 1.5
    })
    const cell = last?.cells.at(-1)
    expect(cell && cell.x + cell.width).toBe(6000)
    expect(cell && cell.y + cell.height).toBe(6000)
  })

  it('needs nothing when the image is panned fully off screen', () => {
    const away = { scale: 2, x: 500, y: 0 }
    expect(
      proofTileNeed({ view: away, image: IMAGE, viewport: VIEWPORT, source: SOURCE, pixelRatio: 3 })
    ).toBeNull()
  })

  it('places a tile over the base image in the same transform', () => {
    const [cell] = proofTileNeed({
      view: ZOOMED,
      image: IMAGE,
      viewport: VIEWPORT,
      source: SOURCE,
      pixelRatio: 3
    })!.cells
    const placed = proofTilePlacement(tileFor(cell), proofImageDisplayRect(ZOOMED, IMAGE))
    expect(placed.x).toBeCloseTo(-40)
    expect(placed.y).toBeCloseTo(-80)
    expect(placed.width).toBeCloseTo(480)
    expect(placed.height).toBeCloseTo(1442 / 3)
    // Panned 30 pt and zoomed: the tile follows the base image exactly.
    const moved = { scale: 4, x: -1030, y: -1200 }
    const again = proofTilePlacement(tileFor(cell), proofImageDisplayRect(moved, IMAGE))
    expect(again.x).toBeCloseTo(-1030 + (1380 * 4000) / 6000)
    expect(again.width).toBeCloseTo((1440 * 4000) / 6000)
  })

  it('reuses a tile for a small pan inside its margin, not for a deeper zoom', () => {
    const need = (view: typeof ZOOMED) =>
      proofTileNeed({ view, image: IMAGE, viewport: VIEWPORT, source: SOURCE, pixelRatio: 1.5 })!
    const first = need(ZOOMED)
    const tile = tileFor(first.cells[0])
    const nudged = need({ ...ZOOMED, x: ZOOMED.x - 20 })
    expect(proofTileCovers(tile, nudged.cells[0], nudged.visible)).toBe(true)
    const far = need({ ...ZOOMED, x: ZOOMED.x - 200 })
    expect(proofTileCovers(tile, far.cells[0], far.visible)).toBe(false)
    const deeper = need({ scale: 3, x: -800, y: -1000 })
    expect(proofTileCovers(tile, deeper.cells[0], deeper.visible)).toBe(false)
  })
})

describe('swapping tiles without a flicker', () => {
  const a = tileFor({ x: 0, y: 0, width: 500, height: 500, maxWidth: 500 })
  const b = tileFor({ x: 400, y: 0, width: 500, height: 500, maxWidth: 500 })
  const drawn = (state: typeof NO_PROOF_TILES_DRAWN) => [...state.under, ...state.current]

  it('keeps the loaded old tile under the new one until the new one has loaded', () => {
    let state = proofTileLoaded(nextProofTilesDrawn(NO_PROOF_TILES_DRAWN, [a]), a)
    state = nextProofTilesDrawn(state, [b])
    expect(drawn(state)).toEqual([a, b])
    state = proofTileLoaded(state, b)
    expect(drawn(state)).toEqual([b])
  })

  it('drops an old tile that never loaded, and does not stack a reused one twice', () => {
    let state = nextProofTilesDrawn(NO_PROOF_TILES_DRAWN, [a])
    state = nextProofTilesDrawn(state, [b])
    expect(drawn(state)).toEqual([b])
    state = proofTileLoaded(state, b)
    state = nextProofTilesDrawn(state, [b])
    expect(drawn(state)).toEqual([b])
  })
})
