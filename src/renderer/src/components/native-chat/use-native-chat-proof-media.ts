import { useEffect, useState } from 'react'
import {
  parseNativeChatProofImageReply,
  parseNativeChatProofVideoReply,
  type NativeChatProofMediaRefusal
} from '../../../../shared/native-chat-proof-media-contract'
import type {
  NativeChatSlackImageResult,
  NativeChatSlackImageVariant
} from '../../../../shared/native-chat-slack-image-contract'

export type NativeChatProofMediaState<T> =
  | { status: 'loading' }
  | { status: 'missing'; reason: NativeChatProofMediaRefusal }
  | { status: 'ready'; value: T }

/** Runs `load` for `key` and keeps its answer; a throw or a host without the call
 *  reads as unavailable. A null key waits. */
function useProofMedia<T>(
  key: string | null,
  load: () => Promise<NativeChatProofMediaState<T>>,
  release?: (value: T) => void
): NativeChatProofMediaState<T> {
  const [state, setState] = useState<{
    key: string
    value: NativeChatProofMediaState<T>
  } | null>(null)
  useEffect(() => {
    if (key === null) {
      return
    }
    let live = true
    let settled: T | null = null
    let request: Promise<NativeChatProofMediaState<T>>
    try {
      request = load()
    } catch {
      request = Promise.resolve({ status: 'missing', reason: 'unavailable' })
    }
    request
      .catch((): NativeChatProofMediaState<T> => ({
        status: 'missing',
        reason: 'unavailable'
      }))
      .then((value) => {
        if (value.status === 'ready') {
          if (!live) {
            release?.(value.value)
            return
          }
          settled = value.value
        }
        if (live) {
          setState({ key, value })
        }
      })
    return () => {
      live = false
      if (settled !== null) {
        release?.(settled)
      }
    }
    // `load` and `release` are per-render closures over `key`'s inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state !== null && state.key === key ? state.value : { status: 'loading' }
}

/** A proof image from ~/.orca-personal/proof/ on this machine. Null `path` waits. */
export function useNativeChatProofImage(
  path: string | null,
  variant: NativeChatSlackImageVariant
): NativeChatProofMediaState<NativeChatSlackImageResult> {
  return useProofMedia(path === null ? null : `${variant}:${path}`, async () => {
    const reply = parseNativeChatProofImageReply(
      await window.api.nativeChat.proofImage({ path: path ?? '', variant })
    )
    return reply.ok
      ? { status: 'ready', value: reply.image }
      : { status: 'missing', reason: reply.reason }
  })
}

/** A proof recording as a blob: URL, revoked when the card lets go of it. */
export function useNativeChatProofVideo(path: string | null): NativeChatProofMediaState<string> {
  return useProofMedia(
    path,
    async () => {
      const reply = parseNativeChatProofVideoReply(
        await window.api.nativeChat.proofVideo({ path: path ?? '' })
      )
      if (!reply.ok) {
        return { status: 'missing', reason: reply.reason }
      }
      // A copy pins the bytes to a plain ArrayBuffer, which Blob requires.
      const blob = new Blob([new Uint8Array(reply.bytes)], {
        type: reply.mimeType
      })
      return { status: 'ready', value: URL.createObjectURL(blob) }
    },
    (url) => URL.revokeObjectURL(url)
  )
}
