import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_WIDTH,
  parseNativeChatProofImageRegionReply
} from '../../shared/native-chat-proof-image-region-contract'
import {
  clearProofImageBitmaps,
  PROOF_IMAGE_BITMAP_CACHE_LIMITS,
  proofImageRegionOutputWidth,
  readProofImageRegion
} from './proof-image-region'
import { clearProofImageCaches } from './proof-media'
import type { SlackCacheDecodedImage, SlackCacheImageCodec } from './slack-cache-image'

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 3)])
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.alloc(64)
])
const FILE = 'figma/2026-10-06-x/after.jpg'

let sandbox: string
let root: string

function put(relative: string, bytes: Buffer, base = root): string {
  const full = path.join(base, relative)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, bytes)
  return full
}

type Recorder = {
  decodes: number
  crops: { x: number; y: number; width: number; height: number }[]
  encodes: { width: number; quality: number }[]
}

/**
 * A source of `width` × `height` whose JPEG is `bytesPerPixel(quality)` per output pixel,
 * so the byte cap and the shrink steps are predictable.
 */
function fakeCodec(
  width = 6742,
  height = 6730,
  bytesPerPixel: (quality: number) => number = () => 0.05
): SlackCacheImageCodec & Recorder {
  const recorder: Recorder = { decodes: 0, crops: [], encodes: [] }
  const image = (w: number, h: number): SlackCacheDecodedImage => ({
    width: w,
    height: h,
    resizeToWidth: (target) => {
      const out = Math.min(target, w)
      const outHeight = Math.max(1, Math.round((h * out) / w))
      return {
        png: () => Buffer.alloc(0),
        jpeg: (quality) => {
          recorder.encodes.push({ width: out, quality })
          return Buffer.alloc(Math.max(1, Math.ceil(out * outHeight * bytesPerPixel(quality))), 7)
        }
      }
    },
    crop: (rect) => {
      recorder.crops.push(rect)
      return image(rect.width, rect.height)
    }
  })
  return Object.assign(recorder, {
    decode: () => {
      recorder.decodes += 1
      return image(width, height)
    }
  })
}

function region(
  codec: SlackCacheImageCodec | null,
  rect: Partial<{ x: number; y: number; width: number; height: number; maxWidth: number }> = {},
  extra: { path?: unknown; maxBytes?: number } = {}
) {
  return readProofImageRegion({
    path: FILE,
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
    maxWidth: 1024,
    ...rect,
    ...extra,
    root,
    codec
  })
}

beforeEach(() => {
  clearProofImageBitmaps()
  clearProofImageCaches()
  sandbox = mkdtempSync(path.join(tmpdir(), 'proof-image-region-'))
  root = path.join(sandbox, '.orca-personal', 'proof')
  put(FILE, JPEG)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  rmSync(sandbox, { recursive: true, force: true })
})

describe('readProofImageRegion', () => {
  it('crops the rectangle in source pixels and scales it to maxWidth', async () => {
    const codec = fakeCodec()
    const reply = await region(codec, { x: 100, y: 200, width: 2000, height: 1000, maxWidth: 800 })
    expect(reply).toMatchObject({
      ok: true,
      mimeType: 'image/jpeg',
      sourceWidth: 6742,
      sourceHeight: 6730,
      x: 100,
      y: 200,
      width: 2000,
      height: 1000,
      outputWidth: 800,
      outputHeight: 400
    })
    expect(codec.crops).toEqual([{ x: 100, y: 200, width: 2000, height: 1000 }])
    expect(parseNativeChatProofImageRegionReply(reply)).toEqual(reply)
  })

  it('clamps a rectangle that runs past the image edge', async () => {
    const codec = fakeCodec()
    const reply = await region(codec, { x: 6000, y: 6500, width: 5000, height: 5000 })
    expect(reply).toMatchObject({ ok: true, x: 6000, y: 6500, width: 742, height: 230 })
    expect(codec.crops).toEqual([{ x: 6000, y: 6500, width: 742, height: 230 }])
  })

  it.each([
    ['starts past the right edge', { x: 6742 }],
    ['starts past the bottom edge', { y: 7000 }],
    ['has no width', { width: 0 }],
    ['has a negative origin', { x: -1 }],
    ['is fractional', { y: 0.5 }],
    ['has no maxWidth', { maxWidth: 0 }]
  ])('refuses a rectangle that %s', async (_name, rect) => {
    expect(await region(fakeCodec(), rect)).toEqual({ ok: false, reason: 'bad-range' })
  })

  it('never returns wider than the host cap, nor more pixels than its budget', async () => {
    const codec = fakeCodec()
    const wide = await region(codec, { width: 6742, height: 1000, maxWidth: 9000 })
    expect(wide).toMatchObject({ ok: true, outputWidth: NATIVE_CHAT_PROOF_IMAGE_REGION_MAX_WIDTH })
    const whole = await region(codec, { width: 6742, height: 6730, maxWidth: 4096 })
    expect(whole).toMatchObject({ ok: true, outputWidth: 2048 })
    expect(proofImageRegionOutputWidth(100, 6730, 2048)).toBe(100)
    expect(proofImageRegionOutputWidth(2048, 8192, 2048)).toBe(1024)
  })

  it('lowers the quality, then the size, to stay under the byte cap', async () => {
    // 1 byte per pixel at q85, 0.5 at q72, 0.25 at q60: a 1000² region at q85 is 1 MB.
    const codec = fakeCodec(6742, 6730, (q) => (q >= 85 ? 1 : q >= 72 ? 0.5 : 0.25))
    const reply = await region(codec, { width: 1000, height: 1000 }, { maxBytes: 200_000 })
    expect(reply).toMatchObject({ ok: true, outputWidth: 750 })
    expect(codec.encodes.map((e) => `${e.width}@${e.quality}`)).toEqual([
      '1000@85',
      '1000@72',
      '1000@60',
      '750@85',
      '750@72',
      '750@60'
    ])
    const ok = reply.ok ? Buffer.from(reply.base64, 'base64').length : Infinity
    expect(ok).toBeLessThanOrEqual(200_000)
    expect(
      await region(
        fakeCodec(6742, 6730, () => 1000),
        {},
        { maxBytes: 10 }
      )
    ).toEqual({
      ok: false,
      reason: 'too-large'
    })
  })

  it('keeps the decoded bitmap for later tiles, briefly, and per file version', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const codec = fakeCodec()
    await region(codec, { x: 0 })
    await region(codec, { x: 1000 })
    expect(codec.decodes).toBe(1)
    vi.advanceTimersByTime(PROOF_IMAGE_BITMAP_CACHE_LIMITS.ttlMs + 1000)
    await region(codec, { x: 2000 })
    expect(codec.decodes).toBe(2)
    utimesSync(path.join(root, FILE), new Date(2020, 0, 1), new Date(2020, 0, 1))
    await region(codec, { x: 3000 })
    expect(codec.decodes).toBe(3)
  })

  it('decodes once for concurrent tiles', async () => {
    const codec = fakeCodec()
    const replies = await Promise.all([0, 1000, 2000].map((x) => region(codec, { x })))
    expect(replies.every((reply) => reply.ok)).toBe(true)
    expect(codec.decodes).toBe(1)
  })

  it('does not keep a bitmap larger than the cache budget', async () => {
    const codec = fakeCodec(20_000, 20_000)
    await region(codec)
    await region(codec)
    expect(codec.decodes).toBe(2)
  })

  it.each([
    ['a traversal', 'figma/../../secret.jpg', 'invalid-path'],
    ['an absolute path outside the folder', 'OUTSIDE', 'outside-folder'],
    ['a symlink out of the folder', 'link.jpg', 'outside-folder'],
    ['a missing file', 'figma/gone.jpg', 'missing'],
    ['a recording', 'figma/2026-10-06-x/flow.mp4', 'wrong-type']
  ])('refuses %s', async (_name, requested, reason) => {
    const outside = put('secret.jpg', JPEG, sandbox)
    symlinkSync(outside, path.join(root, 'link.jpg'))
    put('figma/2026-10-06-x/flow.mp4', MP4)
    const codec = fakeCodec()
    expect(
      await region(codec, {}, { path: requested === 'OUTSIDE' ? outside : requested })
    ).toEqual({ ok: false, reason })
    expect(codec.decodes).toBe(0)
  })

  it('answers unavailable on a host with no codec, or one that cannot crop', async () => {
    expect(await region(null)).toEqual({ ok: false, reason: 'unavailable' })
    const noCrop: SlackCacheImageCodec = {
      decode: () => ({
        width: 10,
        height: 10,
        resizeToWidth: () => ({ png: () => Buffer.alloc(0), jpeg: () => Buffer.alloc(1) })
      })
    }
    expect(await region(noCrop, { width: 5, height: 5 })).toEqual({
      ok: false,
      reason: 'unavailable'
    })
  })

  it('refuses a file written while it is being read, and keeps nothing for it', async () => {
    const file = path.join(root, FILE)
    const probe = await open(file, 'r')
    const proto = Object.getPrototypeOf(probe)
    await probe.close()
    const read = proto.read
    vi.spyOn(proto, 'read').mockImplementation(async function (this: unknown, ...args: unknown[]) {
      // The sniff reads 16 bytes; the whole-file read is the one a writer races.
      if (args[2] === JPEG.length) {
        writeFileSync(file, Buffer.concat([JPEG, Buffer.alloc(10)]))
      }
      return Reflect.apply(read, this, args)
    })
    const codec = fakeCodec()
    expect(await region(codec)).toEqual({ ok: false, reason: 'changed' })
    expect(codec.decodes).toBe(0)
  })
})
