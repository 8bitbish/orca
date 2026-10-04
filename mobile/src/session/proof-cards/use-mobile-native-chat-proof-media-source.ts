import { useEffect, useMemo } from 'react'
import { NATIVE_CHAT_PROOF_MEDIA_RUNTIME_CAPABILITY } from '../../../../src/shared/native-chat-proof-media-capability'
import type { RpcClient } from '../../transport/rpc-client'
import { pruneMobileNativeChatProofCache } from './mobile-native-chat-proof-cache'
import { createExpoMobileNativeChatProofCacheStore } from './mobile-native-chat-proof-cache-store'
import type { MobileNativeChatProofMediaSource } from './mobile-native-chat-proof-context'
import { createMobileNativeChatProofMediaLoader } from './mobile-native-chat-proof-media-loader'
import { createMobileNativeChatProofMediaHost } from './mobile-native-chat-proof-media-operations'

let prunedThisLaunch = false

/** Proof media for one host's chat: a loader while the host advertises
 *  native-chat.proof-media.v1, 'unsupported' for an older host. */
export function useMobileNativeChatProofMediaSource({
  client,
  hostId,
  hostCapabilities,
  statusPending
}: {
  client: RpcClient | null
  hostId: string
  hostCapabilities: readonly string[]
  statusPending: boolean
}): MobileNativeChatProofMediaSource {
  const supported = hostCapabilities.includes(NATIVE_CHAT_PROOF_MEDIA_RUNTIME_CAPABILITY)
  const store = useMemo(() => {
    try {
      return createExpoMobileNativeChatProofCacheStore()
    } catch {
      // No file system here (the web page); the card shows its placeholders.
      return null
    }
  }, [])
  useEffect(() => {
    if (!supported || store === null || prunedThisLaunch) {
      return
    }
    prunedThisLaunch = true
    pruneMobileNativeChatProofCache(store, Date.now())
  }, [store, supported])
  return useMemo<MobileNativeChatProofMediaSource>(() => {
    if (!supported) {
      return statusPending || !client ? { status: 'pending' } : { status: 'unsupported' }
    }
    if (!client) {
      return { status: 'pending' }
    }
    if (store === null) {
      return { status: 'unsupported' }
    }
    return {
      status: 'supported',
      loader: createMobileNativeChatProofMediaLoader({
        hostId,
        host: createMobileNativeChatProofMediaHost(client),
        store
      })
    }
  }, [client, hostId, statusPending, store, supported])
}
