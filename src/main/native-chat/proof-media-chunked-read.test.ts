import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_PROOF_IMAGE_MAX_FILE_BYTES,
  NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES,
  NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES
} from '../../shared/native-chat-proof-media-rpc-contract'
import { readProofMediaChunk, readProofMediaInfo } from './proof-media-chunked-read'
import type { SlackCacheImageCodec } from './slack-cache-image'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1)
])

function mp4(size: number): Buffer {
  const bytes = Buffer.alloc(size)
  bytes.writeUInt32BE(0x20, 0)
  bytes.write('ftypisom', 4, 'latin1')
  for (let index = 12; index < size; index += 1) {
    bytes[index] = (index * 31) % 251
  }
  return bytes
}

let sandbox: string
let root: string

function put(relative: string, bytes: Buffer | string, base = root): string {
  const full = path.join(base, relative)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, bytes)
  return full
}

/** A sparse file of `size` bytes that opens with an MP4 header; too-large checks never read it. */
function sparse(relative: string, size: number): void {
  const full = put(relative, mp4(16))
  const fd = openSync(full, 'r+')
  ftruncateSync(fd, size)
  closeSync(fd)
}

async function info(relative: string) {
  const reply = await readProofMediaInfo({ path: relative, root, codec: null })
  if (!reply.ok) {
    throw new Error(`info refused: ${reply.reason}`)
  }
  return reply
}

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'proof-media-chunks-'))
  root = path.join(sandbox, '.orca-personal', 'proof')
  mkdirSync(root, { recursive: true })
})

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

describe('readProofMediaInfo', () => {
  it('describes a recording and an image, with size from the codec when there is one', async () => {
    const video = mp4(1000)
    put('grid/2026-10-04-x/flow.mp4', video)
    put('grid/2026-10-04-x/after.png', PNG)
    const mtimeMs = statSync(path.join(root, 'grid/2026-10-04-x/flow.mp4')).mtimeMs
    expect(await readProofMediaInfo({ path: 'grid/2026-10-04-x/flow.mp4', root })).toEqual({
      ok: true,
      type: 'video',
      mimeType: 'video/mp4',
      byteLength: 1000,
      mtimeMs
    })
    const codec: SlackCacheImageCodec = {
      decode: () => ({
        width: 390,
        height: 844,
        resizeToWidth: () => ({ png: () => Buffer.alloc(0), jpeg: () => Buffer.alloc(0) })
      })
    }
    const image = await readProofMediaInfo({ path: 'grid/2026-10-04-x/after.png', root, codec })
    expect(image).toMatchObject({ ok: true, type: 'image', mimeType: 'image/png', width: 390 })
    expect(
      await readProofMediaInfo({ path: 'grid/2026-10-04-x/after.png', root, codec: null })
    ).not.toHaveProperty('width')
  })

  it.each([
    ['a parent segment', 'grid/../../secret.mp4', 'invalid-path'],
    ['a NUL byte', 'flow\0.mp4', 'invalid-path'],
    ['a non-string', 7, 'invalid-path'],
    ['a missing file', 'gone.mp4', 'missing'],
    ['an unknown extension', 'notes.txt', 'wrong-type']
  ])('refuses %s', async (_name, requested, reason) => {
    put('notes.txt', 'hello')
    expect(await readProofMediaInfo({ path: requested, root })).toEqual({ ok: false, reason })
  })

  it('refuses an absolute path outside the folder and a symlink that escapes it', async () => {
    const outside = put('secret.mp4', mp4(100), sandbox)
    symlinkSync(outside, path.join(root, 'link.mp4'))
    expect(await readProofMediaInfo({ path: outside, root })).toEqual({
      ok: false,
      reason: 'outside-folder'
    })
    expect(await readProofMediaInfo({ path: 'link.mp4', root })).toEqual({
      ok: false,
      reason: 'outside-folder'
    })
  })

  it('refuses a file that does not sniff as its type, and one over the cap', async () => {
    put('fake.mp4', 'plain text that only claims to be a video')
    put('fake.png', mp4(64))
    sparse('huge.mp4', NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES + 1)
    sparse('huge.png', NATIVE_CHAT_PROOF_IMAGE_MAX_FILE_BYTES + 1)
    for (const [name, reason] of [
      ['fake.mp4', 'wrong-type'],
      ['fake.png', 'wrong-type'],
      ['huge.mp4', 'too-large'],
      ['huge.png', 'too-large']
    ]) {
      expect(await readProofMediaInfo({ path: name, root })).toEqual({ ok: false, reason })
    }
  })

  it('refuses when the proof folder is absent', async () => {
    rmSync(root, { recursive: true })
    expect(await readProofMediaInfo({ path: 'flow.mp4', root })).toEqual({
      ok: false,
      reason: 'folder-missing'
    })
  })
})

describe('readProofMediaChunk', () => {
  it('reassembles a multi-chunk recording byte for byte, with the size clamp', async () => {
    const video = mp4(NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES * 2 + 12345)
    put('flow.mp4', video)
    const { byteLength, mtimeMs } = await info('flow.mp4')
    const parts: Buffer[] = []
    let offset = 0
    for (;;) {
      const reply = await readProofMediaChunk({
        path: 'flow.mp4',
        offset,
        length: NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES * 4,
        byteLength,
        mtimeMs,
        root
      })
      if (!reply.ok) {
        throw new Error(reply.reason)
      }
      expect(reply.offset).toBe(offset)
      expect(reply.bytesRead).toBeLessThanOrEqual(NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES)
      parts.push(Buffer.from(reply.base64, 'base64'))
      offset += reply.bytesRead
      if (reply.eof) {
        break
      }
    }
    expect(parts).toHaveLength(3)
    expect(Buffer.concat(parts).equals(video)).toBe(true)
  })

  it('answers an empty eof slice at the end and refuses an offset past it', async () => {
    put('flow.mp4', mp4(100))
    const { byteLength, mtimeMs } = await info('flow.mp4')
    const base = { path: 'flow.mp4', length: 10, byteLength, mtimeMs, root }
    expect(await readProofMediaChunk({ ...base, offset: 100 })).toEqual({
      ok: true,
      base64: '',
      offset: 100,
      bytesRead: 0,
      eof: true
    })
    expect(await readProofMediaChunk({ ...base, offset: 101 })).toEqual({
      ok: false,
      reason: 'bad-range'
    })
  })

  it.each([
    ['a negative offset', { offset: -1, length: 10 }],
    ['a fractional offset', { offset: 1.5, length: 10 }],
    ['a zero length', { offset: 0, length: 0 }],
    ['a non-finite length', { offset: 0, length: Number.POSITIVE_INFINITY }]
  ])('refuses %s', async (_name, range) => {
    put('flow.mp4', mp4(100))
    const { byteLength, mtimeMs } = await info('flow.mp4')
    expect(
      await readProofMediaChunk({ path: 'flow.mp4', ...range, byteLength, mtimeMs, root })
    ).toEqual({ ok: false, reason: 'bad-range' })
  })

  it('refuses a slice once the file changes between chunks', async () => {
    put('flow.mp4', mp4(2000))
    const { byteLength, mtimeMs } = await info('flow.mp4')
    const first = await readProofMediaChunk({
      path: 'flow.mp4',
      offset: 0,
      length: 1000,
      byteLength,
      mtimeMs,
      root
    })
    expect(first.ok).toBe(true)
    // Same size, new content: only the modified time gives the swap away.
    put('flow.mp4', mp4(2000).fill(9, 12))
    utimesSync(path.join(root, 'flow.mp4'), new Date(), new Date(mtimeMs + 5000))
    const next = { path: 'flow.mp4', offset: 1000, length: 1000, byteLength, mtimeMs, root }
    expect(await readProofMediaChunk(next)).toEqual({ ok: false, reason: 'changed' })
    // A different file renamed over it is refused too.
    put('other.mp4', mp4(3000))
    renameSync(path.join(root, 'other.mp4'), path.join(root, 'flow.mp4'))
    expect(await readProofMediaChunk(next)).toEqual({ ok: false, reason: 'changed' })
  })

  it('re-checks the path on every slice, so a link swapped in later is refused', async () => {
    put('flow.mp4', mp4(100))
    const { byteLength, mtimeMs } = await info('flow.mp4')
    const outside = put('secret.mp4', mp4(100), sandbox)
    rmSync(path.join(root, 'flow.mp4'))
    symlinkSync(outside, path.join(root, 'flow.mp4'))
    expect(
      await readProofMediaChunk({
        path: 'flow.mp4',
        offset: 0,
        length: 10,
        byteLength,
        mtimeMs,
        root
      })
    ).toEqual({ ok: false, reason: 'outside-folder' })
  })
})
