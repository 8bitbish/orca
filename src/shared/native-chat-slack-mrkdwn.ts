// Slack mrkdwn, the format of a message's original text, read into a small tree
// and written back out as CommonMark for the chat's markdown renderers. Only bold,
// italic, strike, code, links and mentions carry over; every other character is
// escaped, so a message can never inject markdown, HTML or a link of its own.

import { buildNativeChatSlackHref } from './native-chat-slack-href'
import { isNativeChatSlackConversationId, isNativeChatSlackUserId } from './native-chat-slack-ids'

export type SlackMrkdwnNode =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'strike'; children: SlackMrkdwnNode[] }
  | { type: 'code'; text: string }
  | { type: 'pre'; text: string }
  | { type: 'link'; url: string; label: string }
  | { type: 'user'; userId: string; label?: string }
  | { type: 'channel'; channelId: string; label?: string }
  | { type: 'break' }

export type SlackMrkdwnMarkdownOptions = {
  /** Without it mentions stay plain text, since a chip needs the team. */
  teamId?: string
  domain?: string
  /** Display names by user id, for `<@U…>` mentions that carry no label. */
  userNames?: Readonly<Record<string, string>>
  /** Channel names by id, for `<#C…>` mentions that carry no label. */
  channelNames?: Readonly<Record<string, string>>
}

export const SLACK_MRKDWN_MAX_LENGTH = 8000
const MAX_DEPTH = 4
const EMPHASIS: Record<string, 'bold' | 'italic' | 'strike'> = {
  '*': 'bold',
  _: 'italic',
  '~': 'strike'
}
const SAFE_URL = /^(?:https?:\/\/|mailto:)[^\s<>]+$/i

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt);/g, (_match, name: string) =>
    name === 'amp' ? '&' : name === 'lt' ? '<' : '>'
  )
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char)
}

function isSpace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char)
}

/** Index just past a `<…>` or `` `…` `` span starting at `at`, or -1 when it does not close on this line. */
function spanEnd(source: string, at: number, close: string): number {
  for (let index = at + 1; index < source.length; index += 1) {
    if (source[index] === '\n') {
      return -1
    }
    if (source[index] === close) {
      return index + 1
    }
  }
  return -1
}

function findCloser(source: string, from: number, marker: string): number {
  for (let index = from; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\n') {
      return -1
    }
    if (char === '<' || char === '`') {
      const end = spanEnd(source, index, char === '<' ? '>' : '`')
      if (end !== -1) {
        index = end - 1
        continue
      }
    }
    if (
      char === marker &&
      index > from &&
      !isSpace(source[index - 1]) &&
      !isWordChar(source[index + 1])
    ) {
      return index
    }
  }
  return -1
}

function parseAngle(token: string): SlackMrkdwnNode {
  const bar = token.indexOf('|')
  const target = bar === -1 ? token : token.slice(0, bar)
  const label = bar === -1 ? undefined : decodeEntities(token.slice(bar + 1)) || undefined
  if (target.startsWith('@')) {
    const userId = target.slice(1)
    return isNativeChatSlackUserId(userId)
      ? { type: 'user', userId, ...(label ? { label } : {}) }
      : { type: 'text', text: label ?? decodeEntities(target) }
  }
  if (target.startsWith('#')) {
    const channelId = target.slice(1)
    return isNativeChatSlackConversationId(channelId)
      ? { type: 'channel', channelId, ...(label ? { label } : {}) }
      : { type: 'text', text: label ?? decodeEntities(target) }
  }
  if (target.startsWith('!')) {
    // <!here>, <!channel>, <!subteam^S…|@team>, <!date^…|fallback>: show the readable part.
    const word = target.slice(1).split('^')[0]
    return { type: 'text', text: label ?? `@${word}` }
  }
  const url = decodeEntities(target)
  return SAFE_URL.test(url)
    ? { type: 'link', url, label: label ?? url }
    : { type: 'text', text: label ?? url }
}

function parseInline(source: string, depth: number): SlackMrkdwnNode[] {
  const nodes: SlackMrkdwnNode[] = []
  let text = ''
  const flush = (): void => {
    if (text !== '') {
      nodes.push({ type: 'text', text: decodeEntities(text) })
      text = ''
    }
  }
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === '\n') {
      flush()
      nodes.push({ type: 'break' })
      index += 1
      continue
    }
    if (depth === 0 && source.startsWith('```', index)) {
      const end = source.indexOf('```', index + 3)
      if (end !== -1) {
        flush()
        nodes.push({
          type: 'pre',
          text: decodeEntities(source.slice(index + 3, end).replace(/^\n/, ''))
        })
        index = end + 3
        continue
      }
    }
    if (char === '`') {
      const end = spanEnd(source, index, '`')
      if (end > index + 2) {
        flush()
        nodes.push({ type: 'code', text: decodeEntities(source.slice(index + 1, end - 1)) })
        index = end
        continue
      }
    }
    if (char === '<') {
      const end = spanEnd(source, index, '>')
      if (end > index + 2) {
        flush()
        nodes.push(parseAngle(source.slice(index + 1, end - 1)))
        index = end
        continue
      }
    }
    const emphasis = EMPHASIS[char]
    if (
      emphasis &&
      depth < MAX_DEPTH &&
      !isWordChar(source[index - 1]) &&
      !isSpace(source[index + 1])
    ) {
      const close = findCloser(source, index + 1, char)
      if (close !== -1) {
        flush()
        nodes.push({
          type: emphasis,
          children: parseInline(source.slice(index + 1, close), depth + 1)
        })
        index = close + 1
        continue
      }
    }
    text += char
    index += 1
  }
  flush()
  return nodes
}

/** The message's mrkdwn as a tree; text past the length cap is dropped. */
export function parseSlackMrkdwn(source: string): SlackMrkdwnNode[] {
  return parseInline(source.replace(/\r\n?/g, '\n').slice(0, SLACK_MRKDWN_MAX_LENGTH), 0)
}

type WriteState = { lineStart: boolean }

function escapeText(text: string, state: WriteState): string {
  let rest = text
  let out = ''
  if (state.lineStart) {
    const lead = /^ +/.exec(rest)
    if (lead) {
      // Four leading spaces would start an indented code block.
      out += '\u00a0'.repeat(lead[0].length)
      rest = rest.slice(lead[0].length)
    }
    if (rest !== '') {
      // A line opening `1.`, `#`, `-`, `+` or `=` would start a list or heading.
      const ordered = /^(\d+)([.)])/.exec(rest)
      if (ordered) {
        out += `${ordered[1]}\\${ordered[2]}`
        rest = rest.slice(ordered[0].length)
      } else if (/^[#+\-=]/.test(rest)) {
        out += `\\${rest[0]}`
        rest = rest.slice(1)
      }
      state.lineStart = false
    }
  }
  return out + rest.replace(/[\\`*_~[\]<>|&]/g, '\\$&')
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

function codeBlock(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `\n${fence}\n${text.replace(/\n$/, '')}\n${fence}\n`
}

function writeNodes(
  nodes: readonly SlackMrkdwnNode[],
  options: SlackMrkdwnMarkdownOptions,
  state: WriteState
): string {
  let out = ''
  for (const node of nodes) {
    out += writeNode(node, options, state)
  }
  return out
}

function chip(prefix: string, label: string, href: string | null, state: WriteState): string {
  const text = escapeText(`${prefix}${label}`, { lineStart: false })
  state.lineStart = false
  return href === null ? text : `[${text}](${href})`
}

function writeNode(
  node: SlackMrkdwnNode,
  options: SlackMrkdwnMarkdownOptions,
  state: WriteState
): string {
  const { teamId, domain } = options
  const withDomain = domain === undefined ? {} : { domain }
  switch (node.type) {
    case 'text':
      return escapeText(node.text, state)
    case 'break':
      state.lineStart = true
      return '\n'
    case 'bold':
    case 'italic':
    case 'strike': {
      const mark = node.type === 'bold' ? '**' : node.type === 'italic' ? '*' : '~~'
      state.lineStart = false
      return `${mark}${writeNodes(node.children, options, state)}${mark}`
    }
    case 'code':
      state.lineStart = false
      return codeSpan(node.text)
    case 'pre':
      state.lineStart = true
      return codeBlock(node.text)
    case 'link':
      state.lineStart = false
      return `[${escapeText(node.label, { lineStart: false })}](<${node.url}>)`
    case 'user':
      return chip(
        '@',
        node.label ?? options.userNames?.[node.userId] ?? node.userId,
        teamId === undefined
          ? null
          : buildNativeChatSlackHref({ kind: 'user', teamId, userId: node.userId, ...withDomain }),
        state
      )
    case 'channel':
      return chip(
        '#',
        node.label ?? options.channelNames?.[node.channelId] ?? node.channelId,
        teamId === undefined
          ? null
          : buildNativeChatSlackHref({
              kind: 'channel',
              teamId,
              channelId: node.channelId,
              ...withDomain
            }),
        state
      )
  }
}

/** Slack mrkdwn as CommonMark, with mentions as Slack chip links. */
export function slackMrkdwnToMarkdown(
  source: string,
  options: SlackMrkdwnMarkdownOptions = {}
): string {
  return writeNodes(parseSlackMrkdwn(source), options, { lineStart: true }).replace(
    /^\n+|\n+$/g,
    ''
  )
}
