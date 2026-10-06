import { useContext, useEffect, useRef, useState } from 'react'
import { PixelRatio } from 'react-native'
import type { ImageZoomSize, ImageZoomView } from '../../../../src/shared/image-zoom-pan'
import { MobileNativeChatProofMediaContext } from './mobile-native-chat-proof-context'
import {
  createProofTileScheduler,
  type MobileNativeChatProofImageRegions,
  type ProofTileScheduler
} from './mobile-native-chat-proof-image-regions'
import {
  NO_PROOF_TILES_DRAWN,
  nextProofTilesDrawn,
  proofTileLoaded,
  proofTileNeed,
  type ProofTile,
  type ProofTilesDrawn
} from './mobile-native-chat-proof-image-tiles'

function useSourceSize(
  regions: MobileNativeChatProofImageRegions | null,
  path: string | null
): ImageZoomSize | null {
  const [size, setSize] = useState<{ path: string; value: ImageZoomSize | null } | null>(null)
  useEffect(() => {
    if (!regions || path === null) {
      return
    }
    let live = true
    void regions.sourceSize(path).then((value) => {
      if (live) {
        setSize({ path, value })
      }
    })
    return () => {
      live = false
    }
  }, [regions, path])
  return size !== null && size.path === path ? size.value : null
}

/** Full-detail tiles to draw over a zoomed proof image, when its host can serve them. None
 *  for an older host, before the view settles, at low zoom, or after any failure. */
export function useMobileNativeChatProofImageTiles({
  path,
  view,
  image,
  viewport
}: {
  path: string | null
  view: ImageZoomView | null
  image: ImageZoomSize
  viewport: ImageZoomSize | null
}): { tiles: readonly ProofTile[]; onTileLoad: (tile: ProofTile) => void } {
  const source = useContext(MobileNativeChatProofMediaContext)
  const regions = source?.status === 'supported' ? (source.regions ?? null) : null
  const sourceSize = useSourceSize(regions, path)
  const [failed, setFailed] = useState(false)
  const [drawn, setDrawn] = useState<ProofTilesDrawn>(NO_PROOF_TILES_DRAWN)
  // Made in an effect, not a memo, so a dev double-mount does not leave a disposed one.
  const scheduler = useRef<ProofTileScheduler | null>(null)
  useEffect(() => {
    if (!regions || path === null) {
      return
    }
    const created = createProofTileScheduler({
      regions,
      path,
      onTiles: (tiles) => setDrawn((prev) => nextProofTilesDrawn(prev, tiles)),
      onFailed: () => setFailed(true)
    })
    scheduler.current = created
    return () => {
      created.dispose()
      if (scheduler.current === created) {
        scheduler.current = null
      }
    }
  }, [regions, path])
  const need =
    regions && path !== null && sourceSize && view && viewport && !failed
      ? proofTileNeed({ view, image, viewport, source: sourceSize, pixelRatio: PixelRatio.get() })
      : null
  const needKey = need
    ? need.cells
        .map((cell) => `${cell.x},${cell.y},${cell.width},${cell.height},${cell.maxWidth}`)
        .join(';')
    : null
  useEffect(() => {
    scheduler.current?.update(need)
    // `need` is rebuilt every render; its cells are what matter.
  }, [regions, path, needKey])
  return {
    tiles: need ? [...drawn.under, ...drawn.current] : [],
    onTileLoad: (tile) => setDrawn((prev) => proofTileLoaded(prev, tile))
  }
}
