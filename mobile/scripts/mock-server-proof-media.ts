import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NATIVE_CHAT_PROOF_RUNTIME_CAPABILITIES } from '../../src/shared/native-chat-proof-media-capability'
import type { RpcRequest, RpcRespond, RpcResponse } from './mock-server-rpc-handlers'

// Why: the desktop's proof readers are pure Node behind a pluggable codec (Electron's
// nativeImage in the app), so the mock reuses them and decodes with macOS `sips` instead.
// Every read stays confined to ~/.orca-personal/proof/ by the desktop's own path checks.

type Rect = { x: number; y: number; width: number; height: number }

// Structural copies of slack-cache-image.ts's codec types.
type SlackCacheDecodedImage = {
  width: number
  height: number
  resizeToWidth: (width: number) => { png: () => Buffer; jpeg: (quality: number) => Buffer }
  crop?: (rect: Rect) => SlackCacheDecodedImage
}
type SlackCacheImageCodec = { decode: (bytes: Buffer) => SlackCacheDecodedImage | null }

type DesktopProofReaders = {
  readProofMediaInfo: (args: { path: unknown }) => Promise<unknown>
  readProofMediaChunk: (args: Record<string, unknown>) => Promise<unknown>
  readProofImage: (args: { path: unknown; variant: 'thumbnail' }) => Promise<unknown>
  readProofImageRegion: (args: Record<string, unknown>) => Promise<unknown>
  setSlackCacheImageCodec: (codec: SlackCacheImageCodec) => void
}

// Why: a computed specifier keeps desktop main-process code out of the mobile typecheck graph,
// where React Native's timer typings reject its Node-only calls (e.g. `unref`).
const DESKTOP_NATIVE_CHAT = '../../src/main/native-chat/'
let desktopReaders: Promise<DesktopProofReaders> | null = null

function loadDesktopReaders(): Promise<DesktopProofReaders> {
  desktopReaders ??= Promise.all(
    ['proof-media-chunked-read', 'proof-media', 'proof-image-region', 'slack-cache-image'].map(
      (name) => import(`${DESKTOP_NATIVE_CHAT}${name}`)
    )
  ).then(([chunked, media, region, slack]) => {
    const readers: DesktopProofReaders = {
      readProofMediaInfo: chunked.readProofMediaInfo,
      readProofMediaChunk: chunked.readProofMediaChunk,
      readProofImage: media.readProofImage,
      readProofImageRegion: region.readProofImageRegion,
      setSlackCacheImageCodec: slack.setSlackCacheImageCodec
    }
    if (process.platform === 'darwin') {
      readers.setSlackCacheImageCodec(sipsCodec)
    }
    return readers
  })
  return desktopReaders
}

function withScratch<T>(bytes: Buffer, run: (input: string, dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'orca-mock-sips-'))
  try {
    const input = join(dir, 'in')
    writeFileSync(input, bytes)
    return run(input, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function sips(args: string[]): string {
  return execFileSync('sips', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
}

function encode(bytes: Buffer, crop: Rect | null, width: number, format: string, quality?: number) {
  return withScratch(bytes, (input, dir) => {
    const output = join(dir, `out.${format}`)
    const args = ['-s', 'format', format]
    if (quality !== undefined) {
      args.push('-s', 'formatOptions', String(quality))
    }
    if (crop) {
      // sips crops around the centre unless given an offset (y then x).
      args.push('--cropToHeightWidth', String(crop.height), String(crop.width))
      args.push('--cropOffset', String(crop.y), String(crop.x))
    }
    args.push('--resampleWidth', String(width), input, '--out', output)
    sips(args)
    return readFileSync(output)
  })
}

function decodedImage(bytes: Buffer, size: { width: number; height: number }, crop: Rect | null) {
  const image: SlackCacheDecodedImage = {
    width: size.width,
    height: size.height,
    resizeToWidth: (width) => ({
      png: () => encode(bytes, crop, width, 'png'),
      jpeg: (quality) => encode(bytes, crop, width, 'jpeg', quality)
    }),
    crop: (rect) => {
      const base = crop ?? { x: 0, y: 0 }
      return decodedImage(
        bytes,
        { width: rect.width, height: rect.height },
        { ...rect, x: base.x + rect.x, y: base.y + rect.y }
      )
    }
  }
  return image
}

const sipsCodec: SlackCacheImageCodec = {
  decode: (bytes) => {
    try {
      const out = withScratch(bytes, (input) =>
        sips(['-g', 'pixelWidth', '-g', 'pixelHeight', input])
      )
      const width = Number(/pixelWidth: (\d+)/.exec(out)?.[1])
      const height = Number(/pixelHeight: (\d+)/.exec(out)?.[1])
      return width > 0 && height > 0 ? decodedImage(bytes, { width, height }, null) : null
    } catch {
      return null
    }
  }
}

export function mockProofMediaEnabled(): boolean {
  return process.env.MOCK_CHAT_SCENARIO === 'proof-scroll'
}

export function mockProofMediaCapabilities(): string[] {
  return mockProofMediaEnabled() ? [...NATIVE_CHAT_PROOF_RUNTIME_CAPABILITIES] : []
}

type Success = (id: string, result: unknown) => RpcResponse

/** Serves `nativeChat.proofMedia*` and `nativeChat.proofImageRegion` with the desktop's readers. */
export function handleMockProofMediaRequest(
  request: RpcRequest,
  respond: RpcRespond,
  success: Success
): boolean {
  if (!mockProofMediaEnabled()) {
    return false
  }
  const params = request.params ?? {}
  const reply = (work: (readers: DesktopProofReaders) => Promise<unknown>) => {
    void loadDesktopReaders()
      .then(work)
      .then(
        (result) => respond(success(request.id, result)),
        () => respond(success(request.id, { ok: false, reason: 'unavailable' }))
      )
  }
  const num = (key: string) => Number(params[key])
  switch (request.method) {
    case 'nativeChat.proofMediaInfo':
      reply((r) => r.readProofMediaInfo({ path: params.path }))
      return true
    case 'nativeChat.proofMediaRead':
      reply((r) =>
        r.readProofMediaChunk({
          path: params.path,
          offset: num('offset'),
          length: num('length'),
          byteLength: num('byteLength'),
          mtimeMs: num('mtimeMs')
        })
      )
      return true
    case 'nativeChat.proofMediaThumbnail':
      reply((r) => r.readProofImage({ path: params.path, variant: 'thumbnail' }))
      return true
    case 'nativeChat.proofImageRegion':
      reply((r) =>
        r.readProofImageRegion({
          path: String(params.path ?? ''),
          x: num('x'),
          y: num('y'),
          width: num('width'),
          height: num('height'),
          maxWidth: num('maxWidth')
        })
      )
      return true
    default:
      return false
  }
}
