// Agent-reply fences drawn as something other than code: a live html / svg / widget preview, or a
// fence renderer the surface provides (project, Slack and proof cards). Both only for closed fences.

import type { ReactNode } from 'react'
import { MobileMarkupPreview } from './markup-preview/MobileMarkupPreview'
import { mobileMarkupPreviewKind } from './markup-preview/mobile-markup-preview-kind'
import type { MobileMarkdownFenceRenderer } from './mobile-markdown-renderers'

type Fence = { text: string; language?: string; closed: boolean }

/** Keys repeat per identical source, so equal fences keep distinct, stable keys. */
function nextKey(occurrences: Map<string, number>, key: string): string {
  const occurrence = occurrences.get(key) ?? 0
  occurrences.set(key, occurrence + 1)
  return `${key}:${occurrence}`
}

export function mobileMarkdownMarkupPreview(
  fence: Fence,
  occurrences: Map<string, number>
): ReactNode | null {
  const kind = fence.closed ? mobileMarkupPreviewKind(fence.language) : null
  if (!kind) {
    return null
  }
  return (
    <MobileMarkupPreview
      key={nextKey(occurrences, `${kind}:${fence.text}`)}
      source={fence.text}
      kind={kind}
    />
  )
}

export function mobileMarkdownRenderedFence(
  fence: Fence,
  codeBlock: ReactNode,
  occurrences: Map<string, number>,
  renderFence: MobileMarkdownFenceRenderer | undefined
): ReactNode | null {
  const key = nextKey(occurrences, `${fence.language ?? ''}:${fence.text}`)
  return fence.closed && renderFence
    ? renderFence({ language: fence.language, text: fence.text }, codeBlock, key)
    : null
}
