import { useContext, useEffect, useState } from 'react'
import type { NativeChatSlackImageResult } from '../../../../src/shared/native-chat-slack-image-contract'
import { MobileNativeChatProofMediaContext } from './mobile-native-chat-proof-context'
import type {
  MobileNativeChatProofFile,
  MobileNativeChatProofMediaLoader,
  MobileNativeChatProofMediaRefusal
} from './mobile-native-chat-proof-media-loader'

export type MobileNativeChatProofMediaState<T> =
  | { status: 'loading'; received?: number; total?: number }
  | { status: 'missing'; reason: MobileNativeChatProofMediaRefusal }
  | { status: 'ready'; value: T }

type ReadyFile = Extract<MobileNativeChatProofFile, { ok: true }>

const LOADING = { status: 'loading' } as const
const UNAVAILABLE = { status: 'missing', reason: 'unavailable' } as const

/** Runs `load` once the host's support is known, for as long as the card shows `key`;
 *  unmounting or a new key aborts it. A null key waits. */
function useProofLoad<T>(
  key: string | null,
  load: (
    loader: MobileNativeChatProofMediaLoader,
    signal: AbortSignal,
    progress: (received: number, total: number) => void
  ) => Promise<MobileNativeChatProofMediaState<T>>
): MobileNativeChatProofMediaState<T> {
  const source = useContext(MobileNativeChatProofMediaContext)
  const [state, setState] = useState<{
    key: string
    value: MobileNativeChatProofMediaState<T>
  } | null>(null)
  const loader = source?.status === 'supported' ? source.loader : null
  const settledWithout = source === null || source.status === 'unsupported'
  useEffect(() => {
    if (key === null || loader === null) {
      return
    }
    const controller = new AbortController()
    const publish = (value: MobileNativeChatProofMediaState<T>): void => {
      if (!controller.signal.aborted) {
        setState({ key, value })
      }
    }
    load(loader, controller.signal, (received, total) =>
      publish({ status: 'loading', received, total })
    )
      .catch(() => UNAVAILABLE)
      .then(publish)
    return () => controller.abort()
    // `load` is a per-render closure over `key`'s inputs.
  }, [key, loader])
  if (key === null) {
    return LOADING
  }
  if (settledWithout) {
    return UNAVAILABLE
  }
  return state !== null && state.key === key && loader !== null ? state.value : LOADING
}

/** A proof file (recording or full-size image) in the phone's cache. Null `path` waits. */
export function useMobileNativeChatProofFile(
  path: string | null
): MobileNativeChatProofMediaState<ReadyFile> {
  return useProofLoad(path, async (loader, signal, onProgress) => {
    const file = await loader.loadFile(path ?? '', { signal, onProgress })
    return file.ok ? { status: 'ready', value: file } : { status: 'missing', reason: file.reason }
  })
}

/** The host's ≤1024 px rendition of a proof image. Null `path` waits. */
export function useMobileNativeChatProofThumbnail(
  path: string | null
): MobileNativeChatProofMediaState<NativeChatSlackImageResult> {
  return useProofLoad(path, async (loader) => {
    const reply = await loader.loadThumbnail(path ?? '')
    return reply.ok
      ? { status: 'ready', value: reply.image }
      : { status: 'missing', reason: reply.reason }
  })
}
