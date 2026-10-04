import type { NativeChatSlackImageResult } from '../../../../src/shared/native-chat-slack-image-contract'
import {
  NATIVE_CHAT_PROOF_IMAGE_MAX_FILE_BYTES,
  NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES,
  NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES,
  type NativeChatProofMediaMime,
  type NativeChatProofMediaRpcRefusal
} from '../../../../src/shared/native-chat-proof-media-rpc-contract'
import {
  mobileNativeChatProofCacheName,
  type MobileNativeChatProofCacheStore
} from './mobile-native-chat-proof-cache'
import type { MobileNativeChatProofMediaHost } from './mobile-native-chat-proof-media-operations'

export type MobileNativeChatProofMediaRefusal = NativeChatProofMediaRpcRefusal

export type MobileNativeChatProofFile =
  | { ok: true; uri: string; mimeType: NativeChatProofMediaMime; width?: number; height?: number }
  | { ok: false; reason: MobileNativeChatProofMediaRefusal }

export type MobileNativeChatProofThumbnail =
  | { ok: true; image: NativeChatSlackImageResult }
  | { ok: false; reason: MobileNativeChatProofMediaRefusal }

export type MobileNativeChatProofProgress = (received: number, total: number) => void

export type MobileNativeChatProofMediaLoader = {
  /** The whole file in the phone's cache, fetched in slices when it is not already there.
   *  Resolves 'unavailable' once `signal` aborts; the download stops when nobody waits on it. */
  loadFile: (
    path: string,
    options?: { signal?: AbortSignal; onProgress?: MobileNativeChatProofProgress }
  ) => Promise<MobileNativeChatProofFile>
  /** The host's ≤1024 px rendition of an image, kept in memory. */
  loadThumbnail: (path: string) => Promise<MobileNativeChatProofThumbnail>
}

const UNAVAILABLE = { ok: false, reason: 'unavailable' } as const
// Data URIs are large; keep only the few a scrolled transcript is likely to redraw.
const MAX_THUMBNAILS = 24

type Flight = {
  controller: AbortController
  refs: number
  listeners: Set<MobileNativeChatProofProgress>
  progress: [number, number] | null
  result: Promise<MobileNativeChatProofFile>
}

/** At most `limit` tasks hold a slot; the rest wait in order. */
function createSlots(limit: number): {
  acquire: (signal: AbortSignal) => Promise<boolean>
  release: () => void
} {
  let busy = 0
  const waiting: (() => void)[] = []
  return {
    acquire: (signal) => {
      if (busy < limit) {
        busy += 1
        return Promise.resolve(true)
      }
      return new Promise((resolve) => {
        const take = (): void => {
          signal.removeEventListener('abort', drop)
          busy += 1
          resolve(true)
        }
        const drop = (): void => {
          const at = waiting.indexOf(take)
          if (at !== -1) {
            waiting.splice(at, 1)
          }
          resolve(false)
        }
        waiting.push(take)
        signal.addEventListener('abort', drop, { once: true })
      })
    },
    release: () => {
      busy -= 1
      waiting.shift()?.()
    }
  }
}

export function createMobileNativeChatProofMediaLoader({
  hostId,
  host,
  store,
  maxConcurrentDownloads = 2
}: {
  hostId: string
  host: MobileNativeChatProofMediaHost
  store: MobileNativeChatProofCacheStore
  maxConcurrentDownloads?: number
}): MobileNativeChatProofMediaLoader {
  const flights = new Map<string, Flight>()
  const thumbnails = new Map<string, Promise<MobileNativeChatProofThumbnail>>()
  const slots = createSlots(maxConcurrentDownloads)

  async function download(
    path: string,
    flight: Flight,
    name: string,
    request: { byteLength: number; mtimeMs: number }
  ): Promise<MobileNativeChatProofMediaRefusal | null> {
    const { signal } = flight.controller
    store.startPart(name)
    let offset = 0
    while (offset < request.byteLength) {
      if (signal.aborted) {
        return 'unavailable'
      }
      const length = Math.min(
        NATIVE_CHAT_PROOF_MEDIA_READ_MAX_CHUNK_BYTES,
        request.byteLength - offset
      )
      const reply = await host.read({ path, offset, length, ...request })
      if (!reply.ok) {
        return reply.reason
      }
      // A slice from elsewhere in the file, or past its end, cannot be stitched in.
      if (
        reply.offset !== offset ||
        reply.bytesRead === 0 ||
        offset + reply.bytesRead > request.byteLength
      ) {
        return 'unavailable'
      }
      store.appendPart(name, reply.base64)
      offset += reply.bytesRead
      flight.progress = [offset, request.byteLength]
      for (const listener of flight.listeners) {
        listener(offset, request.byteLength)
      }
      if (reply.eof) {
        break
      }
    }
    if (signal.aborted) {
      return 'unavailable'
    }
    return offset === request.byteLength && store.partSize(name) === request.byteLength
      ? null
      : 'unavailable'
  }

  async function fetchFile(path: string, flight: Flight): Promise<MobileNativeChatProofFile> {
    const { signal } = flight.controller
    const info = await host.info(path)
    if (!info.ok || signal.aborted) {
      return info.ok ? UNAVAILABLE : info
    }
    const cap =
      info.type === 'video'
        ? NATIVE_CHAT_PROOF_MEDIA_MAX_FILE_BYTES
        : NATIVE_CHAT_PROOF_IMAGE_MAX_FILE_BYTES
    if (info.byteLength > cap) {
      return { ok: false, reason: 'too-large' }
    }
    if (info.byteLength === 0) {
      return UNAVAILABLE
    }
    const name = mobileNativeChatProofCacheName({ hostId, path, ...info })
    const size = info.width && info.height ? { width: info.width, height: info.height } : {}
    const ready = (): MobileNativeChatProofFile => ({
      ok: true,
      uri: store.uri(name),
      mimeType: info.mimeType,
      ...size
    })
    if (store.finishedSize(name) === info.byteLength) {
      return ready()
    }
    if (!(await slots.acquire(signal))) {
      return UNAVAILABLE
    }
    try {
      const refusal = await download(path, flight, name, info)
      if (refusal !== null) {
        store.discardPart(name)
        return { ok: false, reason: refusal }
      }
      store.finishPart(name)
      return ready()
    } catch {
      try {
        store.discardPart(name)
      } catch {
        // Pruning removes a stale part later.
      }
      return UNAVAILABLE
    } finally {
      slots.release()
    }
  }

  function startFlight(path: string): Flight {
    const flight: Flight = {
      controller: new AbortController(),
      refs: 0,
      listeners: new Set(),
      progress: null,
      result: Promise.resolve(UNAVAILABLE)
    }
    flight.result = fetchFile(path, flight)
      .catch(() => UNAVAILABLE)
      .finally(() => {
        if (flights.get(path) === flight) {
          flights.delete(path)
        }
      })
    flights.set(path, flight)
    return flight
  }

  return {
    loadFile: (path, options = {}) => {
      const { signal, onProgress } = options
      if (signal?.aborted) {
        return Promise.resolve(UNAVAILABLE)
      }
      const live = flights.get(path)
      const flight = live && !live.controller.signal.aborted ? live : startFlight(path)
      flight.refs += 1
      if (onProgress) {
        flight.listeners.add(onProgress)
        if (flight.progress) {
          onProgress(...flight.progress)
        }
      }
      return new Promise((resolve) => {
        let left = false
        const leave = (): void => {
          if (left) {
            return
          }
          left = true
          signal?.removeEventListener('abort', abandon)
          if (onProgress) {
            flight.listeners.delete(onProgress)
          }
          flight.refs -= 1
        }
        function abandon(): void {
          leave()
          // The last waiter gone stops the download between slices.
          if (flight.refs === 0) {
            flight.controller.abort()
          }
          resolve(UNAVAILABLE)
        }
        signal?.addEventListener('abort', abandon, { once: true })
        void flight.result.then((result) => {
          if (!left) {
            leave()
            resolve(result)
          }
        })
      })
    },
    loadThumbnail: (path) => {
      const cached = thumbnails.get(path)
      if (cached) {
        thumbnails.delete(path)
        thumbnails.set(path, cached)
        return cached
      }
      const load = host
        .thumbnail(path)
        .catch((): MobileNativeChatProofThumbnail => UNAVAILABLE)
        .then((reply) => {
          // A miss may be a dropped connection; a later mount may try again.
          if (!reply.ok) {
            thumbnails.delete(path)
          }
          return reply
        })
      thumbnails.set(path, load)
      while (thumbnails.size > MAX_THUMBNAILS) {
        thumbnails.delete(thumbnails.keys().next().value!)
      }
      return load
    }
  }
}
