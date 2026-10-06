import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type * as os from 'node:os'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NATIVE_CHAT_PROOF_IMAGE_REGION_MOBILE_METHODS,
  NATIVE_CHAT_PROOF_IMAGE_REGION_RUNTIME_CAPABILITY,
  NATIVE_CHAT_PROOF_MEDIA_MOBILE_METHODS,
  NATIVE_CHAT_PROOF_MEDIA_RUNTIME_CAPABILITY
} from '../../../../shared/native-chat-proof-media-capability'
import { parseNativeChatProofImageRegionReply } from '../../../../shared/native-chat-proof-image-region-contract'
import {
  NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES,
  parseNativeChatProofMediaInfoReply,
  parseNativeChatProofMediaReadReply
} from '../../../../shared/native-chat-proof-media-rpc-contract'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { isMobileRpcMethodAllowed } from '../../runtime-rpc/runtime-rpc-mobile-method-access'
import { clearProofImageBitmaps } from '../../../native-chat/proof-image-region'
import {
  setSlackCacheImageCodec,
  slackCacheImageCodec,
  type SlackCacheImageCodec
} from '../../../native-chat/slack-cache-image'
import { ALL_RPC_METHODS } from './index'
import { NATIVE_CHAT_PROOF_MEDIA_METHODS } from './native-chat-proof-media'

const home = vi.hoisted(() => ({ dir: '' }))
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>()
  return { ...actual, homedir: () => home.dir }
})

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 1)
])
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.alloc(3000, 7)
])

function request(method: string, params: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

function dispatcher(): RpcDispatcher {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the methods never read the runtime.
  const runtime = { getRuntimeId: () => 'test-runtime' } as unknown as OrcaRuntimeService
  return new RpcDispatcher({ runtime, methods: NATIVE_CHAT_PROOF_MEDIA_METHODS })
}

async function call(method: string, params: unknown): Promise<unknown> {
  const response = await dispatcher().dispatch(request(method, params))
  if (!response || !('ok' in response) || response.ok !== true) {
    throw new Error(`RPC failed: ${JSON.stringify(response)}`)
  }
  return response.result
}

beforeEach(() => {
  home.dir = mkdtempSync(path.join(tmpdir(), 'proof-media-rpc-'))
  const bundle = path.join(home.dir, '.orca-personal', 'proof', 'grid', '2026-10-04-x')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(path.join(bundle, 'flow.mp4'), MP4)
  writeFileSync(path.join(bundle, 'after.png'), PNG)
  writeFileSync(path.join(home.dir, 'outside.mp4'), MP4)
})

afterEach(() => {
  rmSync(home.dir, { recursive: true, force: true })
})

describe('nativeChat.proofMedia*', () => {
  it('is registered, open to paired phones and advertised by capability', () => {
    expect(RUNTIME_CAPABILITIES).toContain(NATIVE_CHAT_PROOF_MEDIA_RUNTIME_CAPABILITY)
    expect(NATIVE_CHAT_PROOF_MEDIA_RUNTIME_CAPABILITY).toBe('native-chat.proof-media.v1')
    for (const name of NATIVE_CHAT_PROOF_MEDIA_MOBILE_METHODS) {
      expect(ALL_RPC_METHODS.some((method) => method.name === name)).toBe(true)
      expect(isMobileRpcMethodAllowed(name)).toBe(true)
    }
  })

  it('serves a recording from the host proof folder, chunk by chunk', async () => {
    const info = parseNativeChatProofMediaInfoReply(
      await call('nativeChat.proofMediaInfo', { path: 'grid/2026-10-04-x/flow.mp4' })
    )
    expect(info).toMatchObject({ ok: true, type: 'video', mimeType: 'video/mp4', byteLength: 3012 })
    if (!info.ok) {
      return
    }
    const parts: Buffer[] = []
    for (let offset = 0, eof = false; !eof;) {
      const read = parseNativeChatProofMediaReadReply(
        await call('nativeChat.proofMediaRead', {
          path: 'grid/2026-10-04-x/flow.mp4',
          offset,
          length: 1024,
          byteLength: info.byteLength,
          mtimeMs: info.mtimeMs
        })
      )
      if (!read.ok) {
        throw new Error(read.reason)
      }
      parts.push(Buffer.from(read.base64, 'base64'))
      offset += read.bytesRead
      eof = read.eof
    }
    expect(Buffer.concat(parts).equals(MP4)).toBe(true)
  })

  it('serves an image thumbnail and refuses a recording as one', async () => {
    expect(
      await call('nativeChat.proofMediaThumbnail', { path: 'grid/2026-10-04-x/after.png' })
    ).toMatchObject({
      ok: true,
      image: { mimeType: 'image/png', src: `data:image/png;base64,${PNG.toString('base64')}` }
    })
    expect(
      await call('nativeChat.proofMediaThumbnail', { path: 'grid/2026-10-04-x/flow.mp4' })
    ).toEqual({ ok: false, reason: 'wrong-type' })
  })

  it.each([
    ['a traversal', '../../outside.mp4', 'invalid-path'],
    ['an absolute path outside the folder', 'OUTSIDE', 'outside-folder'],
    ['a missing file', 'grid/2026-10-04-x/gone.mp4', 'missing']
  ])('answers a typed refusal for %s', async (_name, requested, reason) => {
    const pathParam = requested === 'OUTSIDE' ? path.join(home.dir, 'outside.mp4') : requested
    expect(await call('nativeChat.proofMediaInfo', { path: pathParam })).toEqual({
      ok: false,
      reason
    })
    expect(
      await call('nativeChat.proofMediaRead', {
        path: pathParam,
        offset: 0,
        length: 10,
        byteLength: 3012,
        mtimeMs: 1
      })
    ).toEqual({ ok: false, reason })
  })

  it('rejects params outside the schema', async () => {
    const read = { path: 'grid/2026-10-04-x/flow.mp4', offset: 0, length: 10, byteLength: 3012 }
    for (const [method, params] of [
      ['nativeChat.proofMediaInfo', { path: '' }],
      ['nativeChat.proofMediaInfo', { path: 'x'.repeat(1025) }],
      ['nativeChat.proofMediaRead', read],
      ['nativeChat.proofMediaRead', { ...read, mtimeMs: 1, offset: -1 }],
      ['nativeChat.proofMediaRead', { ...read, mtimeMs: 1, offset: 0.5 }],
      ['nativeChat.proofMediaRead', { ...read, mtimeMs: 1, length: 0 }],
      [
        'nativeChat.proofMediaRead',
        { ...read, mtimeMs: 1, length: NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES + 1 }
      ],
      ['nativeChat.proofMediaThumbnail', {}]
    ] as const) {
      expect(await dispatcher().dispatch(request(method, params))).toMatchObject({ ok: false })
    }
  })
})

describe('nativeChat.proofImageRegion', () => {
  const crops: unknown[] = []
  const codec: SlackCacheImageCodec = {
    decode: () => ({
      width: 4000,
      height: 3000,
      resizeToWidth: () => ({ png: () => Buffer.alloc(0), jpeg: () => Buffer.alloc(300, 9) }),
      crop: (rect) => {
        crops.push(rect)
        return {
          width: rect.width,
          height: rect.height,
          resizeToWidth: () => ({ png: () => Buffer.alloc(0), jpeg: () => Buffer.alloc(300, 9) })
        }
      }
    })
  }
  let previous: SlackCacheImageCodec | null = null

  beforeEach(() => {
    previous = slackCacheImageCodec()
    crops.length = 0
    clearProofImageBitmaps()
  })

  afterEach(() => {
    setSlackCacheImageCodec(previous)
  })

  const params = {
    path: 'grid/2026-10-04-x/after.png',
    x: 3500,
    y: 0,
    width: 1000,
    height: 500,
    maxWidth: 8192
  }

  it('is registered, open to paired phones and advertised by its own capability', () => {
    expect(RUNTIME_CAPABILITIES).toContain(NATIVE_CHAT_PROOF_IMAGE_REGION_RUNTIME_CAPABILITY)
    expect(NATIVE_CHAT_PROOF_IMAGE_REGION_RUNTIME_CAPABILITY).toBe(
      'native-chat.proof-image-region.v1'
    )
    expect(NATIVE_CHAT_PROOF_IMAGE_REGION_MOBILE_METHODS).toEqual(['nativeChat.proofImageRegion'])
    for (const name of NATIVE_CHAT_PROOF_IMAGE_REGION_MOBILE_METHODS) {
      expect(ALL_RPC_METHODS.some((method) => method.name === name)).toBe(true)
      expect(isMobileRpcMethodAllowed(name)).toBe(true)
    }
  })

  it('serves a clamped region through the host codec', async () => {
    setSlackCacheImageCodec(codec)
    const reply = parseNativeChatProofImageRegionReply(
      await call('nativeChat.proofImageRegion', params)
    )
    expect(reply).toMatchObject({
      ok: true,
      sourceWidth: 4000,
      sourceHeight: 3000,
      x: 3500,
      width: 500,
      height: 500,
      outputWidth: 500
    })
    expect(crops).toEqual([{ x: 3500, y: 0, width: 500, height: 500 }])
  })

  it('answers unavailable on a host without an image codec', async () => {
    setSlackCacheImageCodec(null)
    expect(await call('nativeChat.proofImageRegion', params)).toEqual({
      ok: false,
      reason: 'unavailable'
    })
  })

  it('answers a typed refusal for a path outside the folder', async () => {
    setSlackCacheImageCodec(codec)
    expect(
      await call('nativeChat.proofImageRegion', { ...params, path: '../../outside.png' })
    ).toEqual({ ok: false, reason: 'invalid-path' })
  })

  it('rejects params outside the schema', async () => {
    for (const bad of [
      { ...params, path: '' },
      { ...params, x: -1 },
      { ...params, y: 1.5 },
      { ...params, width: 0 },
      { ...params, height: 2 ** 21 },
      { ...params, maxWidth: 0 },
      { path: params.path }
    ]) {
      expect(
        await dispatcher().dispatch(request('nativeChat.proofImageRegion', bad))
      ).toMatchObject({ ok: false })
    }
  })
})
