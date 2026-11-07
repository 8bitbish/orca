// Agent-reply fences drawn as something other than code: a live html / svg / widget preview, or a
// fence renderer the surface provides (project, Slack and proof cards). Both only for closed fences.

import type { Code } from 'mdast'
import { isValidElement, type ReactNode } from 'react'
import { MobileMarkupPreview } from './markup-preview/MobileMarkupPreview'
import { MobileMarkdownCodeBlock } from './MobileMarkdownCodeBlock'
import { mobileMarkupPreviewKind } from './markup-preview/mobile-markup-preview-kind'
import { codeFenceClosed } from './mobile-markdown-code-nodes'
import type { MarkdownBlockContext } from './mobile-markdown-blocks'

type MobileMarkdownAgentFenceContext = Pick<
  MarkdownBlockContext,
  'markupPreviews' | 'markupOccurrences' | 'renderFence'
>

type Fence = { text: string; language?: string; closed: boolean }

function codeFence(node: Code): Fence {
  return { text: node.value, language: node.lang ?? undefined, closed: codeFenceClosed(node) }
}

/** Keys repeat per identical source, so equal fences keep distinct, stable keys. */
function nextKey(occurrences: Map<string, number>, key: string): string {
  const occurrence = occurrences.get(key) ?? 0
  occurrences.set(key, occurrence + 1)
  return `${key}:${occurrence}`
}

function mobileMarkdownMarkupPreview(
  node: Code,
  ctx: MobileMarkdownAgentFenceContext
): ReactNode | null {
  if (!ctx.markupPreviews) {
    return null
  }
  const fence = codeFence(node)
  const occurrences = ctx.markupOccurrences
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

function mobileMarkdownRenderedFence(
  node: Code,
  codeBlock: ReactNode,
  ctx: MobileMarkdownAgentFenceContext
): ReactNode | null {
  if (!ctx.markupPreviews) {
    return null
  }
  const fence = codeFence(node)
  const renderFence = ctx.renderFence
  const key = nextKey(ctx.markupOccurrences, `${fence.language ?? ''}:${fence.text}`)
  return fence.closed && renderFence
    ? renderFence({ language: fence.language, text: fence.text }, codeBlock, key)
    : null
}

/** A code node as an agent reply draws it; `drawCode` is the plain code block or Mermaid diagram. */
export function mobileMarkdownAgentFence(
  node: Code,
  ctx: MobileMarkdownAgentFenceContext,
  drawCode: () => ReactNode
): ReactNode {
  const markup = mobileMarkdownMarkupPreview(node, ctx)
  if (markup) {
    return markup
  }
  const drawn = drawCode()
  // A Mermaid diagram stays as drawn; only a plain code block goes to the fence renderer.
  if (!isValidElement(drawn) || drawn.type !== MobileMarkdownCodeBlock) {
    return drawn
  }
  return mobileMarkdownRenderedFence(node, drawn, ctx) ?? drawn
}
