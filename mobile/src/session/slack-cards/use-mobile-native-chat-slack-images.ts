import { useMemo, useRef } from 'react'
import type {
  NativeChatSlackImageResult,
  NativeChatSlackImageVariant
} from '../../../../src/shared/native-chat-slack-image-contract'
import type { RpcClient } from '../../transport/rpc-client'
import type { MobileNativeChatSlack } from './mobile-native-chat-slack-context'
import { fetchMobileNativeChatSlackImage } from './mobile-native-chat-slack-image-operation'

// Data URIs are large; keep only the few a scrolled transcript is likely to redraw.
const MAX_CACHED = 24

/** Image loads for one host's chat, shared across rows so a recycled row does not refetch. */
export function useMobileNativeChatSlackImages(
  client: RpcClient | null,
  hostId: string
): MobileNativeChatSlack {
  const cache = useRef(new Map<string, Promise<NativeChatSlackImageResult | null>>())
  return useMemo<MobileNativeChatSlack>(() => {
    cache.current = new Map()
    return {
      loadImage: (path: string, variant: NativeChatSlackImageVariant) => {
        if (!client) {
          return Promise.resolve(null)
        }
        const key = `${variant}:${path}`
        const cached = cache.current.get(key)
        if (cached) {
          cache.current.delete(key)
          cache.current.set(key, cached)
          return cached
        }
        const load = fetchMobileNativeChatSlackImage(client, path, variant).then((image) => {
          // A miss may be a dropped connection; a later mount may try again.
          if (image === null) {
            cache.current.delete(key)
          }
          return image
        })
        cache.current.set(key, load)
        while (cache.current.size > MAX_CACHED) {
          cache.current.delete(cache.current.keys().next().value!)
        }
        return load
      }
    }
  }, [client, hostId])
}
