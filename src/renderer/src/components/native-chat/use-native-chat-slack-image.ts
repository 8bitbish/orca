import { useEffect, useState } from 'react'
import {
  parseNativeChatSlackImageResult,
  type NativeChatSlackImageResult,
  type NativeChatSlackImageVariant
} from '../../../../shared/native-chat-slack-image-contract'

export type NativeChatSlackImageState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; image: NativeChatSlackImageResult }

/** A Slack card image from the chat host's slack-mcp cache. A refusal, a missing
 *  file or a host without the call all read as `missing`. Null `path` waits. */
export function useNativeChatSlackImage(
  path: string | null,
  variant: NativeChatSlackImageVariant
): NativeChatSlackImageState {
  const [state, setState] = useState<{
    key: string
    value: NativeChatSlackImageState
  } | null>(null)
  const key = path === null ? null : `${variant}:${path}`
  useEffect(() => {
    if (path === null || key === null) {
      return
    }
    let live = true
    const settle = (value: NativeChatSlackImageState): void => {
      if (live) {
        setState({ key, value })
      }
    }
    let request: Promise<unknown>
    try {
      request = window.api.nativeChat.slackImage({ path, variant })
    } catch {
      request = Promise.resolve(null)
    }
    request.then(
      (reply) => {
        // Only a raster data URI ever reaches an <img>.
        const image = parseNativeChatSlackImageResult(reply)
        settle(image ? { status: 'ready', image } : { status: 'missing' })
      },
      () => settle({ status: 'missing' })
    )
    return () => {
      live = false
    }
  }, [key, path, variant])
  return state !== null && state.key === key ? state.value : { status: 'loading' }
}
