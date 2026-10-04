import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import type { NativeChatProofMediaMime } from '../../../../src/shared/native-chat-proof-media-rpc-contract'

/** What the proof media loader does to the phone's cache, by file name, so tests run in memory. */
export type MobileNativeChatProofCacheStore = {
  /** The playable `file://` uri a finished file is read from. */
  uri: (name: string) => string
  /** The finished file's size, or null when it is not there. */
  finishedSize: (name: string) => number | null
  /** Starts an empty `.part` file, replacing any left from an earlier try. */
  startPart: (name: string) => void
  appendPart: (name: string, base64: string) => void
  partSize: (name: string) => number
  /** Moves the `.part` file into place under `name`. */
  finishPart: (name: string) => void
  discardPart: (name: string) => void
  list: () => readonly MobileNativeChatProofCacheEntry[]
  remove: (name: string) => void
}

export type MobileNativeChatProofCacheEntry = {
  name: string
  size: number
  modifiedMs: number
}

export const MOBILE_NATIVE_CHAT_PROOF_CACHE_DIRECTORY = 'proof-media'
export const MOBILE_NATIVE_CHAT_PROOF_CACHE_PART_SUFFIX = '.part'
export const MOBILE_NATIVE_CHAT_PROOF_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const MOBILE_NATIVE_CHAT_PROOF_CACHE_MAX_BYTES = 200 * 1024 * 1024
// A younger `.part` may belong to a download still running.
const STALE_PART_MS = 60 * 60 * 1000

const EXTENSIONS: Record<NativeChatProofMediaMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm'
}

/** One file per host path and version: a changed file (new mtime or size) gets a new name. */
export function mobileNativeChatProofCacheName(args: {
  hostId: string
  path: string
  mtimeMs: number
  byteLength: number
  mimeType: NativeChatProofMediaMime
}): string {
  const id = bytesToHex(sha256(utf8ToBytes(`${args.hostId}\n${args.path}`))).slice(0, 32)
  return `${id}-${Math.round(args.mtimeMs)}-${args.byteLength}.${EXTENSIONS[args.mimeType]}`
}

/** Which files to delete: anything older than 30 days, stale partial downloads, then the
 *  oldest files until the rest fit in 200 MB. */
export function planMobileNativeChatProofCachePrune(
  entries: readonly MobileNativeChatProofCacheEntry[],
  now: number,
  limits: { maxAgeMs: number; maxBytes: number } = {
    maxAgeMs: MOBILE_NATIVE_CHAT_PROOF_CACHE_MAX_AGE_MS,
    maxBytes: MOBILE_NATIVE_CHAT_PROOF_CACHE_MAX_BYTES
  }
): string[] {
  const doomed: string[] = []
  const kept: MobileNativeChatProofCacheEntry[] = []
  for (const entry of entries) {
    const age = now - entry.modifiedMs
    const part = entry.name.endsWith(MOBILE_NATIVE_CHAT_PROOF_CACHE_PART_SUFFIX)
    if (age > limits.maxAgeMs || (part && age > STALE_PART_MS)) {
      doomed.push(entry.name)
    } else if (!part) {
      kept.push(entry)
    }
  }
  let total = kept.reduce((sum, entry) => sum + entry.size, 0)
  for (const entry of [...kept].sort((a, b) => a.modifiedMs - b.modifiedMs)) {
    if (total <= limits.maxBytes) {
      break
    }
    doomed.push(entry.name)
    total -= entry.size
  }
  return doomed
}

/** Never throws: a cache that cannot be listed or trimmed is left as it is. */
export function pruneMobileNativeChatProofCache(
  store: Pick<MobileNativeChatProofCacheStore, 'list' | 'remove'>,
  now: number
): void {
  try {
    for (const name of planMobileNativeChatProofCachePrune(store.list(), now)) {
      try {
        store.remove(name)
      } catch {
        // One locked file should not stop the rest.
      }
    }
  } catch {
    // Listing failed; try again next launch.
  }
}
