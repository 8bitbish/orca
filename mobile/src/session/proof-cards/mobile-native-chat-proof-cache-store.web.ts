import type { MobileNativeChatProofCacheStore } from './mobile-native-chat-proof-cache'

type Finished = { url: string; size: number; modifiedMs: number }

function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** The web build has no file system: proof media lives in memory as blob URLs for the
 *  page's lifetime, under the same size and count policy as the phone's disk cache. */
export function createExpoMobileNativeChatProofCacheStore(): MobileNativeChatProofCacheStore {
  const finished = new Map<string, Finished>()
  const parts = new Map<string, Uint8Array<ArrayBuffer>[]>()
  const partBytes = (name: string): number =>
    (parts.get(name) ?? []).reduce((total, chunk) => total + chunk.byteLength, 0)
  const drop = (name: string): void => {
    const entry = finished.get(name)
    if (entry) {
      URL.revokeObjectURL(entry.url)
      finished.delete(name)
    }
  }
  return {
    uri: (name) => finished.get(name)?.url ?? '',
    finishedSize: (name) => finished.get(name)?.size ?? null,
    startPart: (name) => {
      parts.set(name, [])
    },
    appendPart: (name, base64) => {
      parts.get(name)?.push(decodeBase64(base64))
    },
    partSize: (name) => partBytes(name),
    finishPart: (name) => {
      const chunks = parts.get(name) ?? []
      drop(name)
      finished.set(name, {
        url: URL.createObjectURL(new Blob(chunks)),
        size: partBytes(name),
        modifiedMs: Date.now()
      })
      parts.delete(name)
    },
    discardPart: (name) => {
      parts.delete(name)
    },
    list: () =>
      [...finished].map(([name, entry]) => ({
        name,
        size: entry.size,
        modifiedMs: entry.modifiedMs
      })),
    remove: drop
  }
}
