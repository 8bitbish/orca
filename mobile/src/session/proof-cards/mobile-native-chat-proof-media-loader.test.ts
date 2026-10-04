import { describe, expect, it, vi } from 'vitest'
import type {
  NativeChatProofMediaInfoReply,
  NativeChatProofMediaReadReply,
  NativeChatProofMediaReadRequest
} from '../../../../src/shared/native-chat-proof-media-rpc-contract'
import { NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES } from '../../../../src/shared/native-chat-proof-media-rpc-contract'
import type { MobileNativeChatProofCacheStore } from './mobile-native-chat-proof-cache'
import { createMobileNativeChatProofMediaLoader } from './mobile-native-chat-proof-media-loader'
import type { MobileNativeChatProofMediaHost } from './mobile-native-chat-proof-media-operations'

// Made-up files only.
const CHUNK = NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES
const PATH = 'demo-app/2026-10-04-fake-flow/flow.mp4'

function bytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 7) % 251)
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64')
}

/** A store that keeps decoded bytes, so assembly is checked byte for byte. */
function memoryStore(): MobileNativeChatProofCacheStore & {
  files: Map<string, Uint8Array>
  parts: Map<string, Uint8Array>
} {
  const files = new Map<string, Uint8Array>()
  const parts = new Map<string, Uint8Array>()
  return {
    files,
    parts,
    uri: (name) => `file:///cache/proof-media/${name}`,
    finishedSize: (name) => files.get(name)?.length ?? null,
    startPart: (name) => parts.set(name, new Uint8Array()),
    appendPart: (name, base64) => {
      const before = parts.get(name) ?? new Uint8Array()
      const added = Buffer.from(base64, 'base64')
      const next = new Uint8Array(before.length + added.length)
      next.set(before)
      next.set(added, before.length)
      parts.set(name, next)
    },
    partSize: (name) => parts.get(name)?.length ?? 0,
    finishPart: (name) => {
      files.set(name, parts.get(name)!)
      parts.delete(name)
    },
    discardPart: (name) => parts.delete(name),
    list: () => [],
    remove: (name) => files.delete(name)
  }
}

function fakeHost(
  data: Uint8Array,
  overrides: Partial<MobileNativeChatProofMediaHost> = {},
  mtimeMs = 1_700_000_000_000
): MobileNativeChatProofMediaHost & { reads: NativeChatProofMediaReadRequest[] } {
  const reads: NativeChatProofMediaReadRequest[] = []
  return {
    reads,
    info: vi.fn(async (): Promise<NativeChatProofMediaInfoReply> => ({
      ok: true,
      type: 'video',
      mimeType: 'video/mp4',
      byteLength: data.length,
      mtimeMs
    })),
    read: vi.fn(
      async (request: NativeChatProofMediaReadRequest): Promise<NativeChatProofMediaReadReply> => {
        reads.push(request)
        const slice = data.subarray(request.offset, request.offset + request.length)
        return {
          ok: true,
          base64: toBase64(slice),
          offset: request.offset,
          bytesRead: slice.length,
          eof: request.offset + slice.length >= data.length
        }
      }
    ),
    thumbnail: vi.fn(async () => ({ ok: false, reason: 'unavailable' }) as const),
    ...overrides
  }
}

function loader(
  host: MobileNativeChatProofMediaHost,
  store = memoryStore(),
  maxConcurrentDownloads = 2
) {
  return createMobileNativeChatProofMediaLoader({
    hostId: 'host-a',
    host,
    store,
    maxConcurrentDownloads
  })
}

describe('proof media loader', () => {
  it('reads the file in slices of at most 512 KB and assembles them in order', async () => {
    const data = bytes(CHUNK * 2 + 1234)
    const host = fakeHost(data)
    const store = memoryStore()
    const progress: number[] = []
    const file = await loader(host, store).loadFile(PATH, {
      onProgress: (received) => progress.push(received)
    })
    expect(file).toMatchObject({ ok: true, mimeType: 'video/mp4' })
    expect(host.reads.map(({ offset, length }) => [offset, length])).toEqual([
      [0, CHUNK],
      [CHUNK, CHUNK],
      [CHUNK * 2, 1234]
    ])
    // Every slice echoes the info reply so a swapped file is refused.
    expect(
      host.reads.every(
        (read) => read.byteLength === data.length && read.mtimeMs === 1_700_000_000_000
      )
    ).toBe(true)
    expect(progress).toEqual([CHUNK, CHUNK * 2, data.length])
    const [stored] = [...store.files.values()]
    expect(Buffer.from(stored).equals(Buffer.from(data))).toBe(true)
    expect(store.parts.size).toBe(0)
    expect(file.ok && file.uri).toMatch(
      /^file:\/\/\/cache\/proof-media\/[0-9a-f]{32}-1700000000000-\d+\.mp4$/
    )
  })

  it('reuses the cached file for the same mtime and size without reading again', async () => {
    const data = bytes(4096)
    const store = memoryStore()
    const host = fakeHost(data)
    const first = await loader(host, store).loadFile(PATH)
    const again = await loader(host, store).loadFile(PATH)
    expect(again).toEqual(first)
    expect(host.read).toHaveBeenCalledTimes(1)
    expect(host.info).toHaveBeenCalledTimes(2)
  })

  it('downloads again when the host file has a new mtime or size', async () => {
    const store = memoryStore()
    await loader(fakeHost(bytes(4096)), store).loadFile(PATH)
    const touched = fakeHost(bytes(4096), {}, 1_700_000_999_000)
    await loader(touched, store).loadFile(PATH)
    const grown = fakeHost(bytes(5000))
    await loader(grown, store).loadFile(PATH)
    expect(touched.read).toHaveBeenCalled()
    expect(grown.read).toHaveBeenCalled()
    expect(store.files.size).toBe(3)
  })

  it.each([
    ['missing', 'missing'],
    ['outside-folder', 'outside-folder'],
    ['too-large', 'too-large']
  ] as const)(
    'passes an info refusal (%s) through as the placeholder reason',
    async (reason, expected) => {
      const host = fakeHost(bytes(10), { info: async () => ({ ok: false, reason }) })
      await expect(loader(host).loadFile(PATH)).resolves.toEqual({ ok: false, reason: expected })
      expect(host.read).not.toHaveBeenCalled()
    }
  )

  it('drops the partial file when a slice is refused or torn', async () => {
    const data = bytes(CHUNK + 10)
    const store = memoryStore()
    let calls = 0
    const host = fakeHost(data, {
      read: async () => {
        calls += 1
        return calls === 1
          ? {
              ok: true,
              base64: toBase64(data.subarray(0, CHUNK)),
              offset: 0,
              bytesRead: CHUNK,
              eof: false
            }
          : { ok: false, reason: 'changed' }
      }
    })
    await expect(loader(host, store).loadFile(PATH)).resolves.toEqual({
      ok: false,
      reason: 'changed'
    })
    expect(store.parts.size).toBe(0)
    expect(store.files.size).toBe(0)

    const shifted = fakeHost(data, {
      read: async () => ({
        ok: true,
        base64: toBase64(data.subarray(0, 3)),
        offset: 99,
        bytesRead: 3,
        eof: false
      })
    })
    await expect(loader(shifted, store).loadFile(PATH)).resolves.toEqual({
      ok: false,
      reason: 'unavailable'
    })
    expect(store.files.size).toBe(0)
  })

  it('refuses a file over the cap before reading any of it', async () => {
    const host = fakeHost(bytes(1), {
      info: async () => ({
        ok: true,
        type: 'image',
        mimeType: 'image/png',
        byteLength: 11 * 1024 * 1024,
        mtimeMs: 1
      })
    })
    await expect(loader(host).loadFile('a/b.png')).resolves.toEqual({
      ok: false,
      reason: 'too-large'
    })
    expect(host.read).not.toHaveBeenCalled()
  })

  it('stops between slices once the only waiter aborts, and keeps no partial file', async () => {
    const data = bytes(CHUNK * 4)
    const store = memoryStore()
    const controller = new AbortController()
    const base = fakeHost(data)
    const host = fakeHost(data, {
      read: async (request) => {
        const reply = await base.read(request)
        if (request.offset === CHUNK) {
          controller.abort()
        }
        return reply
      }
    })
    await expect(
      loader(host, store).loadFile(PATH, { signal: controller.signal })
    ).resolves.toEqual({
      ok: false,
      reason: 'unavailable'
    })
    await vi.waitFor(() => expect(store.parts.size).toBe(0))
    expect(base.reads.length).toBeLessThanOrEqual(2)
    expect(store.files.size).toBe(0)
  })

  it('shares one download between two cards and keeps it going while one still waits', async () => {
    const data = bytes(CHUNK * 2)
    const host = fakeHost(data)
    const proofs = loader(host)
    const leaving = new AbortController()
    const first = proofs.loadFile(PATH, { signal: leaving.signal })
    const second = proofs.loadFile(PATH)
    leaving.abort()
    await expect(first).resolves.toEqual({ ok: false, reason: 'unavailable' })
    await expect(second).resolves.toMatchObject({ ok: true })
    expect(host.info).toHaveBeenCalledTimes(1)
  })

  it('runs at most the allowed number of downloads at once', async () => {
    let active = 0
    let peak = 0
    const data = bytes(64)
    const base = fakeHost(data)
    const host = fakeHost(data, {
      read: async (request) => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return base.read(request)
      }
    })
    const proofs = loader(host, memoryStore(), 2)
    const results = await Promise.all(
      ['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4'].map((path) => proofs.loadFile(path))
    )
    expect(results.every((result) => result.ok)).toBe(true)
    expect(peak).toBe(2)
  })

  it('reads a store that throws (no file system) as unavailable', async () => {
    const store = memoryStore()
    store.finishedSize = () => {
      throw new Error('no file system')
    }
    await expect(loader(fakeHost(bytes(8)), store).loadFile(PATH)).resolves.toEqual({
      ok: false,
      reason: 'unavailable'
    })
  })

  it('keeps a thumbnail in memory and retries one that failed', async () => {
    const image = {
      src: 'data:image/png;base64,iVBORw0KGgo=',
      mimeType: 'image/png',
      width: 10,
      height: 20,
      byteLength: 8
    } as const
    let fail = true
    const thumbnail = vi.fn(async () =>
      fail ? ({ ok: false, reason: 'unavailable' } as const) : ({ ok: true, image } as const)
    )
    const proofs = loader(fakeHost(bytes(1), { thumbnail }))
    await expect(proofs.loadThumbnail('a.png')).resolves.toEqual({
      ok: false,
      reason: 'unavailable'
    })
    fail = false
    await expect(proofs.loadThumbnail('a.png')).resolves.toEqual({ ok: true, image })
    await proofs.loadThumbnail('a.png')
    expect(thumbnail).toHaveBeenCalledTimes(2)
  })
})
