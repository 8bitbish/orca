// A press on a chat card's button (or a reply typed into it) as it reaches the agent:
// which card it answers, then the reply. Jake often answers hours later, after other
// topics, so a bare "Install it" can't be placed. Line 1 reads
// `Re: <project> · <title>: <reply>`; a last `[companion-context] {json}` line names the
// card exactly. Same format as the Companion app (ButtonPress.kt), whose feed parses it.

import { isNativeChatCardRecord } from './native-chat-card-actions'
import type { NativeChatProjectCardPayload } from './native-chat-project-card-payload'
import type { NativeChatProofCard } from './native-chat-proof-card-payload'
import type { NativeChatSlackMessageCard } from './native-chat-slack-card-payload'
import type { NativeChatDraftCard } from './native-chat-slack-draft-card-payload'
import type { NativeChatBlock } from './native-chat-types'

export const NATIVE_CHAT_CARD_PRESS_TAG = '[companion-context]'

export type NativeChatCardPress = {
  kind: 'proof-card' | 'project-card' | 'slack-message' | 'slack-draft'
  title: string
  project?: string
  /** Ids the card stands for: worktree, proof (bundle path), permalink, ts, channel, chat. */
  refs: Record<string, string>
}

function cut(text: string, limit: number): string {
  if (text.length <= limit) {
    return text
  }
  let end = limit - 1
  const code = text.charCodeAt(end - 1)
  if (end > 0 && code >= 0xd800 && code <= 0xdbff) {
    end -= 1
  }
  return `${text.slice(0, end).replace(/‍+$/, '')}…`
}

function firstLine(text: string): string {
  return text.split(/\r\n?|\n/)[0].trim()
}

function definedRefs(refs: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(refs).filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
  )
}

export function nativeChatCardPressPrefix(press: NativeChatCardPress): string {
  const title = cut(firstLine(press.title), 90)
  const parts = [press.project?.trim(), title].filter((part): part is string => Boolean(part))
  return `Re: ${parts.join(' · ')}: `
}

/** The full text sent: the readable line, then the tag line. `label` is the button pressed (none when typed). */
export function nativeChatCardPressMessage(
  press: NativeChatCardPress,
  reply: string,
  label?: string
): string {
  const tag: Record<string, string | number> = { v: 1, type: 'button', kind: press.kind }
  tag.title = press.title
  if (press.project) {
    tag.project = press.project
  }
  if (label) {
    tag.label = label
  }
  for (const [key, value] of Object.entries(press.refs)) {
    if (!(key in tag)) {
      tag[key] = value
    }
  }
  return `${nativeChatCardPressPrefix(press)}${reply.trim()}\n${NATIVE_CHAT_CARD_PRESS_TAG} ${JSON.stringify(tag)}`
}

/** A sent message split into what to show and its tag (null when it has none). */
export function splitNativeChatCardPressTag(text: string): {
  shown: string
  tag: Record<string, unknown> | null
} {
  const lines = text.split(/\r\n?|\n/)
  const index = lines.findLastIndex((line) =>
    line.trimStart().startsWith(NATIVE_CHAT_CARD_PRESS_TAG)
  )
  if (index === -1) {
    return { shown: text, tag: null }
  }
  let tag: unknown
  try {
    tag = JSON.parse(lines[index].trimStart().slice(NATIVE_CHAT_CARD_PRESS_TAG.length).trim())
  } catch {
    return { shown: text, tag: null }
  }
  if (!isNativeChatCardRecord(tag)) {
    return { shown: text, tag: null }
  }
  const shown = lines
    .filter((_, lineIndex) => lineIndex !== index)
    .join('\n')
    .trimEnd()
  return { shown, tag }
}

/** A sent message's blocks without the tag line: the first line already names the card. */
export function withoutNativeChatCardPressTag(blocks: NativeChatBlock[]): NativeChatBlock[] {
  return blocks.some(
    (block) => block.type === 'text' && block.text.includes(NATIVE_CHAT_CARD_PRESS_TAG)
  )
    ? blocks.map((block) =>
        block.type === 'text'
          ? { ...block, text: splitNativeChatCardPressTag(block.text).shown }
          : block
      )
    : blocks
}

/** Whether a sent message is `reply`: the reply itself, or a press carrying it (`Re: …: <reply>`, with or without its tag). */
export function nativeChatCardPressMatches(sent: string, reply: string): boolean {
  const want = reply.replace(/\r\n?/g, '\n').trim()
  const shown = splitNativeChatCardPressTag(sent.replace(/\r\n?/g, '\n')).shown.trim()
  return shown === want || (shown.startsWith('Re: ') && shown.endsWith(`: ${want}`))
}

function repoOf(worktree: string): string | undefined {
  return worktree.split('/')[0].trim() || undefined
}

/** A proof's bundle folder (`<proof root>/<project>/<slug>`; media may sit deeper), as the card wrote it. */
function proofBundle(card: NativeChatProofCard): string | undefined {
  const media = card.media[0]
  const segments = media?.path.split('/') ?? []
  if (!media || segments.length < 2) {
    return undefined
  }
  const bundle = segments.slice(0, Math.min(2, segments.length - 1)).join('/')
  const source = media.source.replace(/\\/g, '/')
  return source.endsWith(`/${media.path}`)
    ? `${source.slice(0, source.length - media.path.length)}${bundle}`
    : `~/.orca-personal/proof/${bundle}`
}

export function nativeChatProofCardPress(card: NativeChatProofCard): NativeChatCardPress {
  return {
    kind: 'proof-card',
    title: card.full?.title ?? card.title,
    project: repoOf(card.worktree),
    refs: definedRefs({ worktree: card.worktree, proof: proofBundle(card) })
  }
}

/** `projectName` is the name the card shows, when the client resolved its workspace. */
export function nativeChatProjectCardPress(
  card: NativeChatProjectCardPayload,
  projectName?: string
): NativeChatCardPress {
  return {
    kind: 'project-card',
    title: firstLine(card.ask ?? card.note ?? card.worktree),
    project: projectName?.trim() || repoOf(card.worktree),
    refs: { worktree: card.worktree }
  }
}

export function nativeChatSlackMessageCardPress(
  card: NativeChatSlackMessageCard
): NativeChatCardPress {
  const where = card.channel.kind !== 'dm' && card.channel.name ? ` in #${card.channel.name}` : ''
  return {
    kind: 'slack-message',
    title: `${card.from.name}${where}: ${cut(firstLine(card.summary), 60)}`,
    project: 'Slack',
    refs: definedRefs({ permalink: card.permalink, channel: card.channel.id, ts: card.ts })
  }
}

export function nativeChatDraftCardPress(card: NativeChatDraftCard): NativeChatCardPress {
  const to =
    card.platform === 'slack'
      ? (card.to?.name ?? (card.channel?.name ? `#${card.channel.name}` : card.channel?.id))
      : card.chat.name
  const platform = card.platform.charAt(0).toUpperCase() + card.platform.slice(1)
  return {
    kind: 'slack-draft',
    title: `Draft to ${to ?? '?'}`,
    project: platform,
    refs: definedRefs({
      permalink: card.replyTo?.permalink,
      chat: card.platform === 'slack' ? card.channel?.id : card.chat.id,
      ts: card.replyTo?.ts
    })
  }
}
