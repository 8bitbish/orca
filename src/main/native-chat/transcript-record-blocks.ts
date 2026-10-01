// Centralized record→block mapping for native-chat transcripts. Kept separate
// from the reader so the Claude and Codex per-record decoders share one place
// to evolve as CLI transcript schemas drift (plan KTD risk: schema drift).

import type {
  NativeChatBlock,
  NativeChatImageRefBlock,
  NativeChatToolResultBlock
} from '../../shared/native-chat-types'
import { asRecord, extractString } from '../ai-vault/session-scanner-values'
import { nativeChatThoughtMarkerBlocks } from '../../shared/native-chat-thought-marker'

/** Coerce an arbitrary tool-result payload into a single output string. */
export function toolResultOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (!Array.isArray(value)) {
    const record = asRecord(value)
    if (record) {
      const text = extractString(record.text) ?? extractString(record.content)
      if (text) {
        return text
      }
    }
    return value === undefined || value === null ? '' : JSON.stringify(value)
  }
  const parts: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      parts.push(item)
      continue
    }
    const record = asRecord(item)
    const text = extractString(record?.text) ?? extractString(record?.content)
    if (text) {
      parts.push(text)
    }
  }
  return parts.join('\n')
}

function isClaudeThinkingPart(item: unknown): boolean {
  const type = asRecord(item)?.type
  return type === 'thinking' || type === 'redacted_thinking'
}

/** A record made only of thinking parts reads as one reasoning row, even when
 *  every part is empty: Claude Code signs thinking and records `thinking: ''`,
 *  and redacted thinking never has text. Null for any other content. */
export function claudeThinkingOnlyBlocks(content: unknown): NativeChatBlock[] | null {
  if (!Array.isArray(content) || content.length === 0 || !content.every(isClaudeThinkingPart)) {
    return null
  }
  const blocks: NativeChatBlock[] = []
  for (const item of content) {
    const record = asRecord(item)
    const text = extractString(record?.thinking) ?? extractString(record?.text)
    if (text) {
      blocks.push({ type: 'text', text })
    }
  }
  return blocks.length > 0 ? blocks : nativeChatThoughtMarkerBlocks()
}

/** Build the blocks for one Claude content array (string or block[]). */
export function claudeContentBlocks(content: unknown): NativeChatBlock[] {
  if (typeof content === 'string') {
    const text = content.trim()
    return text ? [{ type: 'text', text: content }] : []
  }
  if (!Array.isArray(content)) {
    return []
  }
  const blocks: NativeChatBlock[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      if (item.trim()) {
        blocks.push({ type: 'text', text: item })
      }
      continue
    }
    const record = asRecord(item)
    if (!record) {
      continue
    }
    const block = claudeContentBlock(record)
    if (block) {
      blocks.push(block)
    }
  }
  return blocks
}

function claudeContentBlock(record: Record<string, unknown>): NativeChatBlock | null {
  switch (record.type) {
    case 'text': {
      const text = extractString(record.text)
      return text ? { type: 'text', text } : null
    }
    case 'thinking': {
      // Thinking beside other content stays inline; a thinking-only record is
      // decoded whole by `claudeThinkingOnlyBlocks` instead.
      const text = extractString(record.thinking) ?? extractString(record.text)
      return text ? { type: 'text', text } : null
    }
    case 'tool_use': {
      const name = extractString(record.name) ?? 'tool'
      const callId = extractString(record.id)
      return { type: 'tool-call', name, input: record.input, ...(callId ? { callId } : {}) }
    }
    case 'tool_result':
      return toolResultBlock(record)
    case 'image':
      return imageRefBlock(record)
    default:
      return null
  }
}

function toolResultBlock(record: Record<string, unknown>): NativeChatToolResultBlock {
  return {
    type: 'tool-result',
    output: toolResultOutput(record.content),
    ...(record.is_error === true ? { isError: true } : {})
  }
}

function imageRefBlock(record: Record<string, unknown>): NativeChatImageRefBlock | null {
  const source = asRecord(record.source)
  const url = extractString(source?.url) ?? extractString(record.url)
  const path = extractString(record.path)
  const alt = extractString(record.alt) ?? undefined
  if (!url && !path) {
    return null
  }
  return {
    type: 'image-ref',
    ...(path ? { path } : {}),
    ...(url ? { url } : {}),
    ...(alt ? { alt } : {})
  }
}
