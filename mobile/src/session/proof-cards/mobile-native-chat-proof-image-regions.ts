// Full-detail tiles of a zoomed proof image, from a host with native-chat.proof-image-region.v1:
// a small in-memory LRU of served tiles, and a scheduler that asks for the visible area once
// a pan or pinch settles.

import type { ImageZoomSize } from '../../../../src/shared/image-zoom-pan'
import type { MobileNativeChatProofImageRegionHost } from './mobile-native-chat-proof-media-operations'
import {
  proofTileCellOnScreen,
  proofTileCovers,
  proofTileKey,
  type ProofTile,
  type ProofTileCell,
  type ProofTileNeed,
  type ProofTileRect
} from './mobile-native-chat-proof-image-tiles'

export type MobileNativeChatProofImageRegions = {
  /** The file's real pixel size, from the host; null when it cannot say. */
  sourceSize: (path: string) => Promise<ImageZoomSize | null>
  /** A recently served tile that already shows this cell's on-screen part. */
  cached: (path: string, cell: ProofTileCell, visible: ProofTileRect) => ProofTile | null
  /** One cell from the host; null on any refusal or failure. Never throws. */
  load: (path: string, cell: ProofTileCell) => Promise<ProofTile | null>
}

/** Tiles are data URIs of at most ~1.4 MB each; a dozen covers a pan back and forth. */
export const PROOF_TILE_CACHE_LIMITS = { maxTiles: 12, maxBytes: 12 * 1024 * 1024 }
const MAX_SIZES = 32

export function createMobileNativeChatProofImageRegions({
  host,
  limits = PROOF_TILE_CACHE_LIMITS
}: {
  host: MobileNativeChatProofImageRegionHost
  limits?: { maxTiles: number; maxBytes: number }
}): MobileNativeChatProofImageRegions {
  const tiles = new Map<string, ProofTile>()
  const sizes = new Map<string, Promise<ImageZoomSize | null>>()
  let bytes = 0

  const remember = (tile: ProofTile): void => {
    const key = proofTileKey(tile)
    const old = tiles.get(key)
    if (old) {
      bytes -= old.uri.length
      tiles.delete(key)
    }
    tiles.set(key, tile)
    bytes += tile.uri.length
    while (tiles.size > limits.maxTiles || (bytes > limits.maxBytes && tiles.size > 1)) {
      const [oldest, evicted] = tiles.entries().next().value!
      tiles.delete(oldest)
      bytes -= evicted.uri.length
    }
  }

  return {
    sourceSize: (path) => {
      const known = sizes.get(path)
      if (known) {
        return known
      }
      const load = host
        .info(path)
        .catch(() => null)
        .then((info) => {
          if (info?.ok && info.type === 'image' && info.width && info.height) {
            return { width: info.width, height: info.height }
          }
          // A dropped connection may answer next time.
          sizes.delete(path)
          return null
        })
      sizes.set(path, load)
      while (sizes.size > MAX_SIZES) {
        sizes.delete(sizes.keys().next().value!)
      }
      return load
    },
    // Newest first.
    cached: (path, cell, visible) => {
      const entries = [...tiles]
      for (let at = entries.length - 1; at >= 0; at -= 1) {
        const [key, tile] = entries[at]
        if (tile.path === path && proofTileCovers(tile, cell, visible)) {
          tiles.delete(key)
          tiles.set(key, tile)
          return tile
        }
      }
      return null
    },
    load: async (path, cell) => {
      try {
        const reply = await host.region({ path, ...cell })
        if (!reply.ok) {
          return null
        }
        const tile: ProofTile = {
          path,
          x: reply.x,
          y: reply.y,
          width: reply.width,
          height: reply.height,
          sourceWidth: reply.sourceWidth,
          sourceHeight: reply.sourceHeight,
          outputWidth: reply.outputWidth,
          outputHeight: reply.outputHeight,
          requestedScale: cell.maxWidth / cell.width,
          uri: `data:${reply.mimeType};base64,${reply.base64}`
        }
        remember(tile)
        return tile
      } catch {
        return null
      }
    }
  }
}

/** How long the view must stay still before its tiles are asked for. */
export const PROOF_TILE_SETTLE_MS = 200

export type ProofTileScheduler = {
  /** The latest view's need; null once the base image is sharp enough. */
  update: (need: ProofTileNeed | null) => void
  dispose: () => void
}

/** Asks for one settled view's cells at a time. A newer view makes any older one stale: its
 *  replies still fill the cache but are not shown. The first failure stops it for good. */
export function createProofTileScheduler({
  regions,
  path,
  onTiles,
  onFailed,
  settleMs = PROOF_TILE_SETTLE_MS
}: {
  regions: MobileNativeChatProofImageRegions
  path: string
  onTiles: (tiles: readonly ProofTile[]) => void
  onFailed: () => void
  settleMs?: number
}): ProofTileScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let dead = false
  let queue = Promise.resolve()

  const current = (run: number): boolean => !dead && run === generation

  async function fill(need: ProofTileNeed, run: number): Promise<void> {
    const shown: ProofTile[] = []
    for (const cell of need.cells) {
      if (!current(run)) {
        return
      }
      if (!proofTileCellOnScreen(cell, need.visible)) {
        continue
      }
      const tile = regions.cached(path, cell, need.visible) ?? (await regions.load(path, cell))
      if (dead) {
        return
      }
      if (!tile) {
        dead = true
        onFailed()
        return
      }
      if (!current(run)) {
        return
      }
      shown.push(tile)
      onTiles([...shown])
    }
  }

  const stop = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    update: (need) => {
      stop()
      generation += 1
      if (dead || need === null) {
        return
      }
      const run = generation
      timer = setTimeout(() => {
        timer = null
        queue = queue.then(() => fill(need, run)).catch(() => {})
      }, settleMs)
    },
    dispose: () => {
      dead = true
      stop()
    }
  }
}
