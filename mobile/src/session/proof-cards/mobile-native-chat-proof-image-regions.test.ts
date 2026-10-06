import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatProofImageRegionReply } from '../../../../src/shared/native-chat-proof-image-region-contract'
import type { NativeChatProofMediaInfoReply } from '../../../../src/shared/native-chat-proof-media-rpc-contract'
import {
  createMobileNativeChatProofImageRegions,
  createProofTileScheduler,
  type MobileNativeChatProofImageRegions
} from './mobile-native-chat-proof-image-regions'
import type { MobileNativeChatProofImageRegionHost } from './mobile-native-chat-proof-media-operations'
import type {
  ProofTile,
  ProofTileCell,
  ProofTileNeed
} from './mobile-native-chat-proof-image-tiles'

// Made-up host: a 4000 × 3000 board whose regions come back as short fake JPEGs.
const PATH = 'demo/board.png'
const INFO: NativeChatProofMediaInfoReply = {
  ok: true,
  type: 'image',
  mimeType: 'image/png',
  byteLength: 10,
  mtimeMs: 1,
  width: 4000,
  height: 3000
}

function served(cell: ProofTileCell): NativeChatProofImageRegionReply {
  return {
    ok: true,
    base64: 'AAAA',
    mimeType: 'image/jpeg',
    sourceWidth: 4000,
    sourceHeight: 3000,
    x: cell.x,
    y: cell.y,
    width: cell.width,
    height: cell.height,
    outputWidth: cell.maxWidth,
    outputHeight: Math.round((cell.height * cell.maxWidth) / cell.width)
  }
}

function fakeHost(
  region: MobileNativeChatProofImageRegionHost['region'] = async (request) => served(request)
) {
  return {
    info: vi.fn<MobileNativeChatProofImageRegionHost['info']>(async () => INFO),
    region: vi.fn(region)
  }
}

const cell = (x: number, maxWidth = 500): ProofTileCell => ({
  x,
  y: 0,
  width: 500,
  height: 500,
  maxWidth
})
const needAt = (x: number, maxWidth = 500): ProofTileNeed => ({
  visible: { x, y: 0, width: 500, height: 500 },
  cells: [cell(x, maxWidth)]
})

describe('proof image region cache', () => {
  it('asks the host for the source size once and turns a reply into a drawable tile', async () => {
    const host = fakeHost()
    const regions = createMobileNativeChatProofImageRegions({ host })
    await expect(regions.sourceSize(PATH)).resolves.toEqual({ width: 4000, height: 3000 })
    await regions.sourceSize(PATH)
    expect(host.info).toHaveBeenCalledTimes(1)
    const tile = await regions.load(PATH, cell(0, 250))
    expect(host.region).toHaveBeenCalledWith({ path: PATH, ...cell(0, 250) })
    expect(tile).toMatchObject({ x: 0, width: 500, requestedScale: 0.5 })
    expect(tile?.uri).toBe('data:image/jpeg;base64,AAAA')
  })

  it('reads a refusal, a throw or a size-less image as no tile', async () => {
    const refused = createMobileNativeChatProofImageRegions({
      host: fakeHost(async () => ({ ok: false, reason: 'unavailable' }))
    })
    await expect(refused.load(PATH, cell(0))).resolves.toBeNull()
    const thrown = createMobileNativeChatProofImageRegions({
      host: fakeHost(async () => {
        throw new Error('lost')
      })
    })
    await expect(thrown.load(PATH, cell(0))).resolves.toBeNull()
    const host = fakeHost()
    host.info.mockResolvedValueOnce({ ...INFO, width: undefined, height: undefined })
    const sizeless = createMobileNativeChatProofImageRegions({ host })
    await expect(sizeless.sourceSize(PATH)).resolves.toBeNull()
    // Not remembered: a later open asks again.
    await expect(sizeless.sourceSize(PATH)).resolves.toEqual({ width: 4000, height: 3000 })
  })

  it('keeps at most the newest tiles, by count and by bytes', async () => {
    const regions = createMobileNativeChatProofImageRegions({
      host: fakeHost(),
      limits: { maxTiles: 2, maxBytes: 10_000 }
    })
    for (const x of [0, 1000, 2000]) {
      await regions.load(PATH, cell(x))
    }
    expect(regions.cached(PATH, cell(0), needAt(0).visible)).toBeNull()
    expect(regions.cached(PATH, cell(1000), needAt(1000).visible)).not.toBeNull()
    expect(regions.cached(PATH, cell(2000), needAt(2000).visible)).not.toBeNull()
    expect(regions.cached('demo/other.png', cell(2000), needAt(2000).visible)).toBeNull()

    // Each fake tile's data URI is 27 characters; a 60-byte budget holds two.
    const tight = createMobileNativeChatProofImageRegions({
      host: fakeHost(),
      limits: { maxTiles: 10, maxBytes: 60 }
    })
    for (const x of [0, 1000, 2000]) {
      await tight.load(PATH, cell(x))
    }
    expect(tight.cached(PATH, cell(0), needAt(0).visible)).toBeNull()
    expect(tight.cached(PATH, cell(2000), needAt(2000).visible)).not.toBeNull()
  })
})

describe('proof tile scheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function fakeRegions(load: MobileNativeChatProofImageRegions['load']) {
    return {
      sourceSize: vi.fn(async () => ({ width: 4000, height: 3000 })),
      cached: vi.fn<MobileNativeChatProofImageRegions['cached']>(() => null),
      load: vi.fn(load)
    }
  }
  const tileOf = (c: ProofTileCell): ProofTile => ({
    path: PATH,
    ...c,
    sourceWidth: 4000,
    sourceHeight: 3000,
    outputWidth: c.maxWidth,
    outputHeight: c.maxWidth,
    requestedScale: c.maxWidth / c.width,
    uri: 'data:image/jpeg;base64,AAAA'
  })

  it('waits for the view to settle and asks only for the last one', async () => {
    const regions = fakeRegions(async (_path, c) => tileOf(c))
    const onTiles = vi.fn()
    const scheduler = createProofTileScheduler({ regions, path: PATH, onTiles, onFailed: vi.fn() })
    for (const x of [0, 10, 20]) {
      scheduler.update(needAt(x))
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(regions.load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(regions.load).toHaveBeenCalledTimes(1)
    expect(regions.load).toHaveBeenCalledWith(PATH, cell(20))
    expect(onTiles).toHaveBeenLastCalledWith([tileOf(cell(20))])
  })

  it('drops a stale reply and asks for the new view after it, one at a time', async () => {
    const pending: ((tile: ProofTile) => void)[] = []
    const regions = fakeRegions(
      (_path, c) => new Promise((resolve) => pending.push(() => resolve(tileOf(c))))
    )
    const onTiles = vi.fn()
    const scheduler = createProofTileScheduler({ regions, path: PATH, onTiles, onFailed: vi.fn() })
    scheduler.update(needAt(0))
    await vi.advanceTimersByTimeAsync(200)
    scheduler.update(needAt(1000))
    await vi.advanceTimersByTimeAsync(200)
    // The new view waits for the old request rather than piling onto the host.
    expect(regions.load).toHaveBeenCalledTimes(1)
    pending[0](tileOf(cell(0)))
    await vi.advanceTimersByTimeAsync(0)
    expect(onTiles).not.toHaveBeenCalled()
    expect(regions.load).toHaveBeenCalledTimes(2)
    pending[1](tileOf(cell(1000)))
    await vi.advanceTimersByTimeAsync(0)
    expect(onTiles).toHaveBeenCalledWith([tileOf(cell(1000))])
  })

  it('uses a cached tile without asking the host', async () => {
    const regions = fakeRegions(async (_path, c) => tileOf(c))
    regions.cached.mockReturnValue(tileOf(cell(0)))
    const onTiles = vi.fn()
    const scheduler = createProofTileScheduler({ regions, path: PATH, onTiles, onFailed: vi.fn() })
    scheduler.update(needAt(0))
    await vi.advanceTimersByTimeAsync(200)
    expect(regions.load).not.toHaveBeenCalled()
    expect(onTiles).toHaveBeenCalledWith([tileOf(cell(0))])
  })

  it('cancels a pending request when zoomed back out, and after dispose', async () => {
    const regions = fakeRegions(async (_path, c) => tileOf(c))
    const scheduler = createProofTileScheduler({
      regions,
      path: PATH,
      onTiles: vi.fn(),
      onFailed: vi.fn()
    })
    scheduler.update(needAt(0))
    scheduler.update(null)
    await vi.advanceTimersByTimeAsync(500)
    scheduler.update(needAt(0))
    scheduler.dispose()
    await vi.advanceTimersByTimeAsync(500)
    expect(regions.load).not.toHaveBeenCalled()
  })

  it('stops for good after the first failure', async () => {
    const regions = fakeRegions(async () => null)
    const onFailed = vi.fn()
    const onTiles = vi.fn()
    const scheduler = createProofTileScheduler({ regions, path: PATH, onTiles, onFailed })
    scheduler.update(needAt(0))
    await vi.advanceTimersByTimeAsync(200)
    expect(onFailed).toHaveBeenCalledTimes(1)
    scheduler.update(needAt(1000))
    await vi.advanceTimersByTimeAsync(500)
    expect(regions.load).toHaveBeenCalledTimes(1)
    expect(onTiles).not.toHaveBeenCalled()
  })
})
