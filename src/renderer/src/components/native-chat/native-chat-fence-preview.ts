// Which renderer a fenced block in a chat message gets.
//
// Diagrams render from finished source only. While a reply streams, its last
// fence has no closing marker yet and its body grows every frame; rendering it
// then would re-run Mermaid or rebuild a preview document per token and flash
// parse errors for source that is merely incomplete.

import { createContext } from 'react'
import { NATIVE_CHAT_PROJECT_CARD_FENCE } from '../../../../shared/native-chat-project-card-payload'

export { NATIVE_CHAT_PROJECT_CARD_FENCE }

export type NativeChatFenceRoute = 'mermaid' | 'html' | 'svg' | 'widget' | 'project-card' | 'code'

export type NativeChatFencePreviewScope = {
  /** Live HTML/SVG/widget previews and project cards; on for assistant replies only. */
  markupPreviews: boolean
  /** Body of the message's trailing unclosed fence, or null when every fence closed. */
  openFenceBody: string | null
  /** The message the fence belongs to; project cards key their reply state by it. */
  messageId?: string
}

/** No provider: the block is not in a reply, so markup stays code. */
export const NativeChatFencePreviewContext = createContext<NativeChatFencePreviewScope>({
  markupPreviews: false,
  openFenceBody: null
})

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/** The body of a trailing fence that has not been closed, as CommonMark would
 *  read it to the end of the document. */
export function nativeChatOpenFenceBody(markdown: string): string | null {
  let open: { marker: string; bodyStart: number } | null = null
  let lineStart = 0
  while (lineStart <= markdown.length) {
    const newline = markdown.indexOf('\n', lineStart)
    const lineEnd = newline === -1 ? markdown.length : newline
    const match = FENCE_LINE.exec(markdown.slice(lineStart, lineEnd))
    if (match) {
      const [, marker, rest] = match
      if (open === null) {
        // A backtick fence's info string may not contain a backtick.
        if (!(marker.startsWith('`') && rest.includes('`'))) {
          open = { marker, bodyStart: newline === -1 ? markdown.length : newline + 1 }
        }
      } else if (
        marker[0] === open.marker[0] &&
        marker.length >= open.marker.length &&
        rest.trim() === ''
      ) {
        open = null
      }
    }
    if (newline === -1) {
      break
    }
    lineStart = newline + 1
  }
  return open === null ? null : markdown.slice(open.bodyStart)
}

function sameFenceBody(left: string, right: string): boolean {
  return left.replace(/\s+$/, '') === right.replace(/\s+$/, '')
}

export function nativeChatFenceRoute({
  language,
  code,
  scope
}: {
  language: string | undefined
  code: string
  scope: NativeChatFencePreviewScope
}): NativeChatFenceRoute {
  const normalized = language?.toLowerCase()
  if (
    normalized !== 'mermaid' &&
    normalized !== 'html' &&
    normalized !== 'svg' &&
    normalized !== 'widget' &&
    normalized !== NATIVE_CHAT_PROJECT_CARD_FENCE
  ) {
    return 'code'
  }
  if (scope.openFenceBody !== null && sameFenceBody(scope.openFenceBody, code)) {
    return 'code'
  }
  if (normalized === 'mermaid') {
    return 'mermaid'
  }
  return scope.markupPreviews ? normalized : 'code'
}
