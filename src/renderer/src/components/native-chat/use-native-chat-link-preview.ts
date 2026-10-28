import { useEffect, useState } from 'react'
import type { NativeChatLinkCardItem } from '../../../../shared/native-chat-link-cards-payload'
import {
  parseNativeChatLinkPreviewResult,
  type NativeChatLinkPreviewResult
} from '../../../../shared/native-chat-link-preview-contract'

// Previews loaded this session (null = nothing to show), so a remounted card paints at once.
const loaded = new Map<string, NativeChatLinkPreviewResult | null>()
const pending = new Map<string, Promise<NativeChatLinkPreviewResult | null>>()

function previewKey(item: NativeChatLinkCardItem): string {
  return `${item.url}\n${item.image ?? ''}`
}

function request(item: NativeChatLinkCardItem): Promise<NativeChatLinkPreviewResult | null> {
  const key = previewKey(item)
  const inFlight = pending.get(key)
  if (inFlight) {
    return inFlight
  }
  let call: Promise<unknown>
  try {
    call = window.api.nativeChat.linkPreview(
      item.image ? { url: item.url, image: item.image } : { url: item.url }
    )
  } catch {
    call = Promise.resolve(null)
  }
  const next = call.then(
    (reply) => parseNativeChatLinkPreviewResult(reply),
    // An old host or a failed fetch leaves the card's own fields.
    () => null
  )
  pending.set(key, next)
  void next.then((result) => {
    pending.delete(key)
    loaded.set(key, result)
  })
  return next
}

/** The host's preview of a card's page; undefined while loading, null when none came. */
export function useNativeChatLinkPreview(
  item: NativeChatLinkCardItem
): NativeChatLinkPreviewResult | null | undefined {
  const key = previewKey(item)
  const [result, setResult] = useState(() => loaded.get(key))
  useEffect(() => {
    if (loaded.has(key)) {
      setResult(loaded.get(key))
      return
    }
    let live = true
    setResult(undefined)
    void request(item).then((next) => {
      if (live) {
        setResult(next)
      }
    })
    return () => {
      live = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the key covers url and image.
  }, [key])
  return result
}
