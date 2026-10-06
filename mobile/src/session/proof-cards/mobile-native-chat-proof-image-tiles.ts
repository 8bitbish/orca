// Which part of a large proof image to fetch at full detail while the viewer is zoomed in,
// and where a fetched tile sits on screen. Pure, so it runs under Vitest.
//
// Android's image pipeline decodes a local file to at most 2048 px a side, so a 6742 px
// board stays blurry when zoomed. Past about 1:1 device pixels, the host sends the visible
// rectangle (`nativeChat.proofImageRegion`) and it is drawn over the base image.

import type { ImageZoomSize, ImageZoomView } from '../../../../src/shared/image-zoom-pan'

export type ProofTileRect = { x: number; y: number; width: number; height: number }

/** One region request, in source pixels. */
export type ProofTileCell = ProofTileRect & { maxWidth: number }

export type ProofTileNeed = {
  /** The on-screen part of the image, in source pixels. */
  visible: ProofTileRect
  /** The visible part plus a margin, split so no tile is over 2048 px a side. */
  cells: ProofTileCell[]
}

/** A served region, ready to draw. */
export type ProofTile = ProofTileRect & {
  path: string
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  /** Output pixels per source pixel that was asked for; the host may send fewer to fit 1 MB. */
  requestedScale: number
  uri: string
}

/** Android samples a larger bitmap down by 2×, so neither the base nor a tile goes past it. */
export const PROOF_BITMAP_MAX_SIDE = 2048
/** Extra source area fetched on each side, as a share of the visible size. */
export const PROOF_TILE_MARGIN = 0.1
/** How far past 1:1 device pixels the base may be stretched before a tile is worth it. */
const TRIGGER = 1.05
/** Neighbouring cells overlap by this many source pixels, so no seam shows between them. */
const CELL_OVERLAP = 2
/** A cached tile this close to the wanted detail is used as it is. */
const SCALE_TOLERANCE = 0.9

/** Where the base image is drawn in the viewport. */
export function proofImageDisplayRect(view: ImageZoomView, image: ImageZoomSize): ProofTileRect {
  return {
    x: view.x,
    y: view.y,
    width: image.width * view.scale,
    height: image.height * view.scale
  }
}

/** The base bitmap's width: what it reported, never more than the pipeline decodes. */
export function proofBaseBitmapWidth(image: ImageZoomSize, source: ImageZoomSize): number {
  const decoded =
    source.width * Math.min(1, PROOF_BITMAP_MAX_SIDE / Math.max(source.width, source.height))
  return Math.min(image.width, decoded)
}

function edges(start: number, end: number, parts: number): number[] {
  return Array.from(
    { length: parts + 1 },
    (_, i) => start + Math.round(((end - start) * i) / parts)
  )
}

/** The regions to fetch for this view, or null when the base image is sharp enough. */
export function proofTileNeed({
  view,
  image,
  viewport,
  source,
  pixelRatio
}: {
  view: ImageZoomView
  /** The size the base image is laid out at (its thumbnail's or decoded size). */
  image: ImageZoomSize
  viewport: ImageZoomSize
  /** The file's real pixel size, from the host. */
  source: ImageZoomSize
  pixelRatio: number
}): ProofTileNeed | null {
  const display = proofImageDisplayRect(view, image)
  const base = proofBaseBitmapWidth(image, source)
  if (
    !(display.width > 0) ||
    !(display.height > 0) ||
    !(pixelRatio > 0) ||
    source.width <= base * TRIGGER ||
    display.width * pixelRatio <= base * TRIGGER
  ) {
    return null
  }
  const left = Math.max(0, display.x)
  const top = Math.max(0, display.y)
  const right = Math.min(viewport.width, display.x + display.width)
  const bottom = Math.min(viewport.height, display.y + display.height)
  if (right <= left || bottom <= top) {
    return null
  }
  const perPointX = source.width / display.width
  const perPointY = source.height / display.height
  const visible = {
    x: (left - display.x) * perPointX,
    y: (top - display.y) * perPointY,
    width: (right - left) * perPointX,
    height: (bottom - top) * perPointY
  }
  const x0 = Math.max(0, Math.floor(visible.x - visible.width * PROOF_TILE_MARGIN))
  const y0 = Math.max(0, Math.floor(visible.y - visible.height * PROOF_TILE_MARGIN))
  const x1 = Math.min(source.width, Math.ceil(visible.x + visible.width * (1 + PROOF_TILE_MARGIN)))
  const y1 = Math.min(
    source.height,
    Math.ceil(visible.y + visible.height * (1 + PROOF_TILE_MARGIN))
  )
  // Device pixels per source pixel; the host never enlarges, so 1 is the most it serves.
  const scale = Math.min(1, (display.width * pixelRatio) / source.width)
  const cols = Math.max(1, Math.ceil(((x1 - x0) * scale) / PROOF_BITMAP_MAX_SIDE))
  const rows = Math.max(1, Math.ceil(((y1 - y0) * scale) / PROOF_BITMAP_MAX_SIDE))
  const xs = edges(x0, x1, cols)
  const ys = edges(y0, y1, rows)
  const cells: ProofTileCell[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = xs[col]
      const y = ys[row]
      const width = Math.min(x1, xs[col + 1] + (col < cols - 1 ? CELL_OVERLAP : 0)) - x
      const height = Math.min(y1, ys[row + 1] + (row < rows - 1 ? CELL_OVERLAP : 0)) - y
      const maxWidth = Math.max(
        1,
        Math.min(
          Math.floor(width * scale),
          Math.floor((width * PROOF_BITMAP_MAX_SIDE) / height),
          PROOF_BITMAP_MAX_SIDE
        )
      )
      cells.push({ x, y, width, height, maxWidth })
    }
  }
  return { visible, cells }
}

function intersect(a: ProofTileRect, b: ProofTileRect): ProofTileRect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const width = Math.min(a.x + a.width, b.x + b.width) - x
  const height = Math.min(a.y + a.height, b.y + b.height) - y
  return width > 0 && height > 0 ? { x, y, width, height } : null
}

/** The part of a cell that is on screen; null when it is all margin. */
export function proofTileCellOnScreen(
  cell: ProofTileCell,
  visible: ProofTileRect
): ProofTileRect | null {
  return intersect(cell, visible)
}

/** Whether `tile` already shows the on-screen part of `cell` at about the detail it asks for. */
export function proofTileCovers(
  tile: ProofTile,
  cell: ProofTileCell,
  visible: ProofTileRect
): boolean {
  const wanted = intersect(cell, visible)
  if (!wanted) {
    return true
  }
  return (
    tile.x <= wanted.x &&
    tile.y <= wanted.y &&
    tile.x + tile.width >= wanted.x + wanted.width &&
    tile.y + tile.height >= wanted.y + wanted.height &&
    tile.requestedScale >= (cell.maxWidth / cell.width) * SCALE_TOLERANCE
  )
}

/** Where a tile is drawn, in viewport points, for the base image's current placement. */
export function proofTilePlacement(tile: ProofTile, display: ProofTileRect): ProofTileRect {
  const perSourceX = display.width / tile.sourceWidth
  const perSourceY = display.height / tile.sourceHeight
  return {
    x: display.x + tile.x * perSourceX,
    y: display.y + tile.y * perSourceY,
    width: tile.width * perSourceX,
    height: tile.height * perSourceY
  }
}

export function proofTileKey(tile: ProofTile): string {
  return `${tile.path}|${tile.x},${tile.y},${tile.width},${tile.height}|${tile.outputWidth}`
}

export type ProofTilesDrawn = {
  /** The latest view's tiles, drawn on top. */
  current: readonly ProofTile[]
  /** The previous view's loaded tiles, kept underneath until the new ones have loaded. */
  under: readonly ProofTile[]
  loaded: ReadonlySet<string>
}

export const NO_PROOF_TILES_DRAWN: ProofTilesDrawn = { current: [], under: [], loaded: new Set() }
const MAX_UNDER = 4

function settle(drawn: ProofTilesDrawn): ProofTilesDrawn {
  return drawn.under.length > 0 &&
    drawn.current.every((tile) => drawn.loaded.has(proofTileKey(tile)))
    ? { ...drawn, under: [] }
    : drawn
}

/** The next tiles to draw: what was on screen and loaded stays under the new set. */
export function nextProofTilesDrawn(
  drawn: ProofTilesDrawn,
  tiles: readonly ProofTile[]
): ProofTilesDrawn {
  const fresh = new Set(tiles.map(proofTileKey))
  const under = [...drawn.under, ...drawn.current]
    .filter((tile) => drawn.loaded.has(proofTileKey(tile)) && !fresh.has(proofTileKey(tile)))
    .slice(-MAX_UNDER)
  const keys = new Set([...under, ...tiles].map(proofTileKey))
  const loaded = new Set([...drawn.loaded].filter((key) => keys.has(key)))
  return settle({ current: tiles, under, loaded })
}

export function proofTileLoaded(drawn: ProofTilesDrawn, tile: ProofTile): ProofTilesDrawn {
  const key = proofTileKey(tile)
  if (drawn.loaded.has(key)) {
    return drawn
  }
  return settle({ ...drawn, loaded: new Set([...drawn.loaded, key]) })
}
