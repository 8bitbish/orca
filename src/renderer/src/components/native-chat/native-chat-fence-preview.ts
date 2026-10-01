// Which renderer a fenced block in a chat message gets.
//
// Diagrams render from finished source only. While a reply streams, its last
// fence has no closing marker yet and its body grows every frame; rendering it
// then would re-run Mermaid or rebuild a preview document per token and flash
// parse errors for source that is merely incomplete.

import { createContext } from 'react'
import { NATIVE_CHAT_PROJECT_CARD_FENCE } from '../../../../shared/native-chat-project-card-payload'
import {
  NATIVE_CHAT_SLACK_DRAFT_FENCE,
  NATIVE_CHAT_SLACK_MESSAGE_FENCE
} from '../../../../shared/native-chat-slack-card-payload'
import { nativeChatShellRunBlock } from '../../../../shared/native-chat-shell-run-block'

export { NATIVE_CHAT_PROJECT_CARD_FENCE }

export type NativeChatFenceRoute =
  | 'mermaid'
  | 'html'
  | 'svg'
  | 'widget'
  | 'project-card'
  | 'slack-message'
  | 'slack-draft'
  | 'shell-run'
  | 'code'

export type NativeChatFencePreviewScope = {
  /** Live HTML/SVG/widget previews, project and Slack cards; on for assistant replies only. */
  markupPreviews: boolean
  /** Body of the message's trailing unclosed fence, or null when every fence closed. */
  openFenceBody: string | null
  /** The message the fence belongs to; project cards key their reply state by it. */
  messageId?: string
  /** Run buttons on shell fences; on for the agent's own replies only. */
  shellRuns?: boolean
  /** The message's closed fence bodies in order, so a run can key itself by block index. */
  fenceBodies?: readonly string[]
}

/** No provider: the block is not in a reply, so markup stays code. */
export const NativeChatFencePreviewContext = createContext<NativeChatFencePreviewScope>({
  markupPreviews: false,
  openFenceBody: null
})

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/** Each closed fence's body in order, and the body of a trailing fence still open,
 *  as CommonMark would read it to the end of the document. */
export function nativeChatFences(markdown: string): { closed: string[]; open: string | null } {
  const closed: string[] = []
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
        closed.push(markdown.slice(open.bodyStart, lineStart))
        open = null
      }
    }
    if (newline === -1) {
      break
    }
    lineStart = newline + 1
  }
  return { closed, open: open === null ? null : markdown.slice(open.bodyStart) }
}

/** The body of a trailing fence that has not been closed. */
export function nativeChatOpenFenceBody(markdown: string): string | null {
  return nativeChatFences(markdown).open
}

export function sameFenceBody(left: string, right: string): boolean {
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
  if (scope.openFenceBody !== null && sameFenceBody(scope.openFenceBody, code)) {
    return 'code'
  }
  const normalized = language?.toLowerCase()
  if (
    normalized !== 'mermaid' &&
    normalized !== 'html' &&
    normalized !== 'svg' &&
    normalized !== 'widget' &&
    normalized !== NATIVE_CHAT_PROJECT_CARD_FENCE &&
    normalized !== NATIVE_CHAT_SLACK_MESSAGE_FENCE &&
    normalized !== NATIVE_CHAT_SLACK_DRAFT_FENCE
  ) {
    return scope.shellRuns === true && nativeChatShellRunBlock(language, code) !== null
      ? 'shell-run'
      : 'code'
  }
  if (normalized === 'mermaid') {
    return 'mermaid'
  }
  return scope.markupPreviews ? normalized : 'code'
}
