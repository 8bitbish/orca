import { Directory, File, Paths } from 'expo-file-system'
import {
  MOBILE_NATIVE_CHAT_PROOF_CACHE_DIRECTORY,
  MOBILE_NATIVE_CHAT_PROOF_CACHE_PART_SUFFIX,
  type MobileNativeChatProofCacheStore
} from './mobile-native-chat-proof-cache'

/** Proof media under the OS cache directory, which the OS may also clear when space is short. */
export function createExpoMobileNativeChatProofCacheStore(): MobileNativeChatProofCacheStore {
  const directory = new Directory(Paths.cache, MOBILE_NATIVE_CHAT_PROOF_CACHE_DIRECTORY)
  const file = (name: string): File => new File(directory, name)
  const part = (name: string): File => file(`${name}${MOBILE_NATIVE_CHAT_PROOF_CACHE_PART_SUFFIX}`)
  return {
    uri: (name) => file(name).uri,
    finishedSize: (name) => {
      const finished = file(name)
      return finished.exists ? finished.size : null
    },
    startPart: (name) => {
      directory.create({ intermediates: true, idempotent: true })
      part(name).create({ overwrite: true })
    },
    appendPart: (name, base64) => {
      part(name).write(base64, { encoding: 'base64', append: true })
    },
    partSize: (name) => part(name).size,
    finishPart: (name) => {
      const finished = file(name)
      // expo's move refuses an existing destination.
      if (finished.exists) {
        finished.delete()
      }
      part(name).move(finished)
    },
    discardPart: (name) => {
      const partial = part(name)
      if (partial.exists) {
        partial.delete()
      }
    },
    list: () => {
      if (!directory.exists) {
        return []
      }
      return directory
        .list()
        .flatMap((entry) =>
          entry instanceof File
            ? [{ name: entry.name, size: entry.size, modifiedMs: entry.modificationTime ?? 0 }]
            : []
        )
    },
    remove: (name) => {
      const target = file(name)
      if (target.exists) {
        target.delete()
      }
    }
  }
}
