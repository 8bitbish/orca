import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readProofImage, readProofVideo, resolveProofMediaPath } from './proof-media'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1)
])
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.alloc(64, 2)
])
const MOV = Buffer.concat([
  Buffer.from([0, 0, 0, 0x14]),
  Buffer.from('ftypqt  ', 'latin1'),
  Buffer.alloc(16)
])
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(32)])

let sandbox: string
let root: string

function put(relative: string, bytes: Buffer | string, base = root): string {
  const full = path.join(base, relative)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, bytes)
  return full
}

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'proof-media-'))
  root = path.join(sandbox, '.orca-personal', 'proof')
  mkdirSync(root, { recursive: true })
})

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

describe('resolveProofMediaPath', () => {
  it('resolves a relative path and an absolute one inside the folder', async () => {
    const file = put('grid/2026-10-04-x/flow.mp4', MP4)
    const relative = await resolveProofMediaPath('grid/2026-10-04-x/flow.mp4', 'video', root)
    const absolute = await resolveProofMediaPath(file, 'video', root)
    expect(relative.ok && path.basename(relative.path)).toBe('flow.mp4')
    expect(absolute).toEqual(relative)
  })

  it.each([
    ['a parent segment', 'grid/../../secret.mp4'],
    ['a NUL byte', 'flow\0.mp4'],
    ['an empty path', ''],
    ['a non-string', 42]
  ])('refuses %s', async (_name, requested) => {
    expect(await resolveProofMediaPath(requested, 'video', root)).toEqual({
      ok: false,
      reason: 'invalid-path'
    })
  })

  it('refuses an absolute path outside the folder', async () => {
    const outside = put('elsewhere.mp4', MP4, sandbox)
    expect(await resolveProofMediaPath(outside, 'video', root)).toEqual({
      ok: false,
      reason: 'outside-folder'
    })
  })

  it('refuses a symlink that escapes the folder', async () => {
    const outside = put('secret.png', PNG, sandbox)
    symlinkSync(outside, path.join(root, 'link.png'))
    expect(await resolveProofMediaPath('link.png', 'image', root)).toEqual({
      ok: false,
      reason: 'outside-folder'
    })
  })

  it('refuses a link that renames another kind of file', async () => {
    put('notes.txt', 'hello')
    symlinkSync(path.join(root, 'notes.txt'), path.join(root, 'notes.mp4'))
    expect(await resolveProofMediaPath('notes.mp4', 'video', root)).toEqual({
      ok: false,
      reason: 'wrong-type'
    })
  })

  it('refuses the wrong extension for the media type, and a missing folder', async () => {
    put('shot.png', PNG)
    expect(await resolveProofMediaPath('shot.png', 'video', root)).toEqual({
      ok: false,
      reason: 'wrong-type'
    })
    expect(await resolveProofMediaPath('a.png', 'image', path.join(sandbox, 'nope'))).toEqual({
      ok: false,
      reason: 'folder-missing'
    })
  })
})

describe('readProofVideo', () => {
  it.each([
    ['flow.mp4', MP4, 'video/mp4'],
    ['flow.mov', MOV, 'video/quicktime'],
    ['flow.webm', WEBM, 'video/webm']
  ])('reads %s as %s', async (name, bytes, mimeType) => {
    put(name, bytes)
    const read = await readProofVideo({ path: name, root })
    expect(read.ok && read.mimeType).toBe(mimeType)
    expect(read.ok && Buffer.from(read.bytes).equals(bytes)).toBe(true)
  })

  it('refuses a missing file, a file that is not a video, and one over the cap', async () => {
    expect(await readProofVideo({ path: 'gone.mp4', root })).toEqual({
      ok: false,
      reason: 'missing'
    })
    put('fake.mp4', 'just text, long enough to sniff')
    expect(await readProofVideo({ path: 'fake.mp4', root })).toEqual({
      ok: false,
      reason: 'wrong-type'
    })
    put('big.mp4', MP4)
    expect(await readProofVideo({ path: 'big.mp4', root, maxBytes: 10 })).toEqual({
      ok: false,
      reason: 'too-large'
    })
  })
})

describe('readProofImage', () => {
  it('reads a PNG as a data URI and refuses one outside the folder', async () => {
    put('_fixture/after.png', PNG)
    const read = await readProofImage({
      path: '_fixture/after.png',
      variant: 'thumbnail',
      root,
      codec: null
    })
    expect(read.ok && read.image.src.startsWith('data:image/png;base64,')).toBe(true)
    const outside = put('secret.png', PNG, sandbox)
    expect(
      await readProofImage({
        path: outside,
        variant: 'full',
        root,
        codec: null
      })
    ).toEqual({
      ok: false,
      reason: 'outside-folder'
    })
  })

  it('refuses a file that only claims to be an image', async () => {
    put('fake.png', 'not a png')
    expect(
      await readProofImage({
        path: 'fake.png',
        variant: 'full',
        root,
        codec: null
      })
    ).toEqual({
      ok: false,
      reason: 'wrong-type'
    })
  })
})
