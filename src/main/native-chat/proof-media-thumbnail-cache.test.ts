import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readProofMediaInfo } from './proof-media-chunked-read'
import { clearProofImageCaches, readProofImage } from './proof-media'
import type { SlackCacheImageCodec } from './slack-cache-image'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1)
])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const FILE = 'grid/2026-10-06-x/after.png'

let sandbox: string
let root: string

function put(relative: string, bytes: Buffer, base = root): string {
  const full = path.join(base, relative)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, bytes)
  return full
}

/** A 4000 px square image: every thumbnail must be re-encoded, so each decode is visible. */
function countingCodec(): SlackCacheImageCodec & { decodes: number; resizes: number } {
  const codec = {
    decodes: 0,
    resizes: 0,
    decode: () => {
      codec.decodes += 1
      return {
        width: 4000,
        height: 4000,
        resizeToWidth: () => {
          codec.resizes += 1
          return {
            png: () => Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(32)]),
            jpeg: () => Buffer.concat([JPEG, Buffer.alloc(32)])
          }
        }
      }
    }
  }
  return codec
}

function thumbnail(codec: SlackCacheImageCodec, requested: unknown = FILE) {
  return readProofImage({ path: requested, variant: 'thumbnail', root, codec })
}

beforeEach(() => {
  clearProofImageCaches()
  sandbox = mkdtempSync(path.join(tmpdir(), 'proof-thumbnail-cache-'))
  root = path.join(sandbox, '.orca-personal', 'proof')
  put(FILE, PNG)
})

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

describe('proof thumbnail cache', () => {
  it('decodes once and serves the second request from memory', async () => {
    const codec = countingCodec()
    const first = await thumbnail(codec)
    const second = await thumbnail(codec)
    expect(first).toMatchObject({ ok: true, image: { mimeType: 'image/png', width: 1024 } })
    expect(second).toEqual(first)
    expect(codec.decodes).toBe(1)
    expect(codec.resizes).toBe(1)
  })

  it('makes a new thumbnail when the file’s mtime or size changes', async () => {
    const codec = countingCodec()
    const file = path.join(root, FILE)
    await thumbnail(codec)
    utimesSync(file, new Date(2020, 0, 1), new Date(2020, 0, 1))
    await thumbnail(codec)
    expect(codec.decodes).toBe(2)
    const { mtime } = statSync(file)
    writeFileSync(file, Buffer.concat([PNG, Buffer.alloc(8)]))
    utimesSync(file, mtime, mtime)
    await thumbnail(codec)
    expect(codec.decodes).toBe(3)
  })

  it('shares one decode between concurrent requests', async () => {
    const codec = countingCodec()
    const replies = await Promise.all([thumbnail(codec), thumbnail(codec), thumbnail(codec)])
    expect(new Set(replies.map((reply) => JSON.stringify(reply))).size).toBe(1)
    expect(codec.decodes).toBe(1)
  })

  it('lets the full image and the phone’s info call reuse the known size without decoding', async () => {
    const codec = countingCodec()
    await thumbnail(codec)
    const full = await readProofImage({ path: FILE, variant: 'full', root, codec })
    expect(full).toMatchObject({ ok: true, image: { width: 4000, height: 4000 } })
    const info = await readProofMediaInfo({ path: FILE, root, codec })
    expect(info).toMatchObject({ ok: true, width: 4000, height: 4000 })
    expect(codec.decodes).toBe(1)
  })

  it('caches no refusal', async () => {
    const codec = countingCodec()
    const later = 'grid/2026-10-06-x/later.png'
    expect(await thumbnail(codec, later)).toEqual({ ok: false, reason: 'missing' })
    put(later, PNG)
    expect(await thumbnail(codec, later)).toMatchObject({ ok: true })
  })

  it('still runs every path check before the cache', async () => {
    const codec = countingCodec()
    expect(await thumbnail(codec)).toMatchObject({ ok: true })
    const outside = put('secret.png', PNG, sandbox)
    unlinkSync(path.join(root, FILE))
    symlinkSync(outside, path.join(root, FILE))
    expect(await thumbnail(codec)).toEqual({ ok: false, reason: 'outside-folder' })
    expect(await thumbnail(codec, `grid/../../secret.png`)).toEqual({
      ok: false,
      reason: 'invalid-path'
    })
    expect(await thumbnail(codec, outside)).toEqual({ ok: false, reason: 'outside-folder' })
  })
})
