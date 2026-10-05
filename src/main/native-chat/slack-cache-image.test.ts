import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readSlackCacheImage,
  resolveSlackCacheImagePath,
  SLACK_CACHE_IMAGE_MAX_FILE_BYTES,
  slackCacheThumbnailWidth,
  type SlackCacheImageCodec
} from './slack-cache-image'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1)
])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)])
const GIF = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(64, 3)])

let sandbox: string
let root: string

function put(relative: string, bytes: Buffer | string, base = root): string {
  const full = path.join(base, relative)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, bytes)
  return full
}

/** A codec that reports a fixed size and encodes to recognisable bytes. */
function fakeCodec(
  width: number,
  height: number,
  encodedBytes = 10
): SlackCacheImageCodec & {
  resizedTo: number[]
} {
  const resizedTo: number[] = []
  return {
    resizedTo,
    decode: () => ({
      width,
      height,
      resizeToWidth: (target) => {
        resizedTo.push(target)
        return {
          png: () => Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(encodedBytes)]),
          jpeg: () => Buffer.concat([JPEG.subarray(0, 4), Buffer.alloc(encodedBytes)])
        }
      }
    })
  }
}

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'slack-cache-image-'))
  root = path.join(sandbox, 'Library', 'Caches', 'slack-mcp', 'files')
  mkdirSync(root, { recursive: true })
})

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

describe('resolveSlackCacheImagePath', () => {
  it('resolves a cache-relative path and an absolute one inside the cache', async () => {
    const file = put('FFAKE0001/shot.png', PNG)
    const relative = await resolveSlackCacheImagePath('FFAKE0001/shot.png', root)
    const absolute = await resolveSlackCacheImagePath(file, root)
    expect(relative.ok && path.basename(relative.path)).toBe('shot.png')
    expect(absolute).toEqual(relative)
  })

  it.each([
    ['a parent segment', 'FFAKE0001/../../secret.png'],
    ['a leading parent', '../secret.png'],
    ['a backslash parent', '..\\secret.png'],
    ['a NUL byte', 'shot\0.png'],
    ['an empty path', '']
  ])('refuses %s as an invalid path', async (_name, requested) => {
    expect(await resolveSlackCacheImagePath(requested, root)).toEqual({
      ok: false,
      reason: 'invalid-path'
    })
  })

  it('refuses an absolute path outside the cache', async () => {
    const outside = put('elsewhere.png', PNG, sandbox)
    expect(await resolveSlackCacheImagePath(outside, root)).toEqual({
      ok: false,
      reason: 'outside-cache'
    })
  })

  it('refuses a symlink that escapes the cache', async () => {
    const outside = put('secret.png', PNG, sandbox)
    symlinkSync(outside, path.join(root, 'link.png'))
    expect(await resolveSlackCacheImagePath('link.png', root)).toEqual({
      ok: false,
      reason: 'outside-cache'
    })
  })

  it('refuses a symlinked folder that escapes the cache', async () => {
    put('private/secret.png', PNG, sandbox)
    symlinkSync(path.join(sandbox, 'private'), path.join(root, 'dir'))
    expect(await resolveSlackCacheImagePath('dir/secret.png', root)).toEqual({
      ok: false,
      reason: 'outside-cache'
    })
  })

  it('refuses a link inside the cache that renames a non-image', async () => {
    put('notes.txt', 'not an image')
    symlinkSync(path.join(root, 'notes.txt'), path.join(root, 'notes.png'))
    expect(await resolveSlackCacheImagePath('notes.png', root)).toEqual({
      ok: false,
      reason: 'not-image'
    })
  })

  it('follows a symlink that stays inside the cache', async () => {
    put('FFAKE0001/shot.png', PNG)
    symlinkSync(path.join(root, 'FFAKE0001', 'shot.png'), path.join(root, 'alias.png'))
    const resolved = await resolveSlackCacheImagePath('alias.png', root)
    expect(resolved.ok && path.basename(resolved.path)).toBe('shot.png')
  })

  it('refuses a wrong extension', async () => {
    put('notes.txt', 'hello')
    put('logo.svg', '<svg/>')
    expect(await resolveSlackCacheImagePath('notes.txt', root)).toEqual({
      ok: false,
      reason: 'not-image'
    })
    expect(await resolveSlackCacheImagePath('logo.svg', root)).toEqual({
      ok: false,
      reason: 'not-image'
    })
  })

  it('reports a missing file', async () => {
    expect(await resolveSlackCacheImagePath('gone.png', root)).toEqual({
      ok: false,
      reason: 'missing'
    })
  })

  it('reports an absent cache root', async () => {
    rmSync(root, { recursive: true })
    expect(await resolveSlackCacheImagePath('shot.png', root)).toEqual({
      ok: false,
      reason: 'cache-missing'
    })
  })

  it('refuses the cache root itself', async () => {
    expect((await resolveSlackCacheImagePath(root, root)).ok).toBe(false)
  })
})

describe('readSlackCacheImage', () => {
  const read = (relative: string, extra: Partial<Parameters<typeof readSlackCacheImage>[0]> = {}) =>
    readSlackCacheImage({
      path: relative,
      variant: 'thumbnail',
      maxBytes: SLACK_CACHE_IMAGE_MAX_FILE_BYTES,
      root,
      codec: null,
      ...extra
    })

  it('returns a small image as is, as a data URI', async () => {
    put('shot.png', PNG)
    const result = await read('shot.png', { codec: fakeCodec(400, 300) })
    expect(result).toEqual({
      ok: true,
      image: {
        src: `data:image/png;base64,${PNG.toString('base64')}`,
        mimeType: 'image/png',
        width: 400,
        height: 300,
        byteLength: PNG.length
      }
    })
  })

  it('takes the type from the bytes, not the name', async () => {
    put('photo.png', JPEG)
    const result = await read('photo.png')
    expect(result.ok && result.image.mimeType).toBe('image/jpeg')
  })

  it('refuses a file whose bytes are not an image', async () => {
    put('fake.png', 'plain text pretending')
    expect(await read('fake.png')).toEqual({ ok: false, reason: 'not-image' })
  })

  it('refuses a file over 10 MB', async () => {
    put('huge.png', Buffer.concat([PNG, Buffer.alloc(SLACK_CACHE_IMAGE_MAX_FILE_BYTES)]))
    expect(await read('huge.png', { variant: 'full' })).toEqual({ ok: false, reason: 'too-large' })
  })

  it('scales a wide image down for a thumbnail', async () => {
    put('wide.png', PNG)
    const codec = fakeCodec(4000, 2000)
    const result = await read('wide.png', { codec })
    expect(codec.resizedTo).toEqual([1024])
    expect(result.ok && result.image).toMatchObject({
      mimeType: 'image/png',
      width: 1024,
      height: 512
    })
  })

  it('bounds a very tall thumbnail by area, keeping its shape', async () => {
    put('tall.png', PNG)
    const codec = fakeCodec(1481, 4000)
    const result = await read('tall.png', { codec })
    expect(codec.resizedTo).toEqual([881])
    expect(result.ok && result.image).toMatchObject({ width: 881, height: 2379 })
    expect(slackCacheThumbnailWidth(1170, 2532)).toBe(984)
    expect(slackCacheThumbnailWidth(800, 600)).toBe(800)
  })

  it('scales a small but very tall original down for a thumbnail', async () => {
    put('strip.png', PNG)
    const codec = fakeCodec(600, 12000)
    await read('strip.png', { codec })
    expect(codec.resizedTo).toEqual([323])
  })

  it('falls back to JPEG when the scaled PNG is still too big', async () => {
    put('wide.png', PNG)
    const codec: SlackCacheImageCodec = {
      decode: () => ({
        width: 4000,
        height: 2000,
        resizeToWidth: () => ({
          png: () => Buffer.alloc(2 * 1024 * 1024),
          jpeg: () => Buffer.concat([JPEG.subarray(0, 4), Buffer.alloc(10)])
        })
      })
    }
    const result = await read('wide.png', { codec })
    expect(result.ok && result.image.mimeType).toBe('image/jpeg')
  })

  it('sends the full image as is when it fits the caller', async () => {
    put('wide.gif', GIF)
    const codec = fakeCodec(4000, 2000)
    const result = await read('wide.gif', { variant: 'full', codec })
    expect(codec.resizedTo).toEqual([])
    expect(result.ok && result.image.mimeType).toBe('image/gif')
  })

  it('re-encodes a full image that does not fit the transport', async () => {
    put('big.jpg', Buffer.concat([JPEG, Buffer.alloc(4000)]))
    const codec = fakeCodec(5000, 2500)
    const result = await read('big.jpg', { variant: 'full', maxBytes: 1000, codec })
    expect(codec.resizedTo).toEqual([2048])
    expect(result.ok && result.image).toMatchObject({ mimeType: 'image/jpeg', width: 2048 })
  })

  it('refuses what cannot be made to fit without a codec', async () => {
    put('big.webp', Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP', 'latin1'), Buffer.alloc(4000)]))
    expect(await read('big.webp', { variant: 'full', maxBytes: 1000 })).toEqual({
      ok: false,
      reason: 'too-large-to-send'
    })
  })

  it('passes refusals from path resolution through', async () => {
    expect(await read('../x.png')).toEqual({ ok: false, reason: 'invalid-path' })
    expect(await read('missing.png')).toEqual({ ok: false, reason: 'missing' })
  })
})
