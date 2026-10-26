import {
  NATIVE_CHAT_INTERRUPTED_STATUS_TEXT,
  type NativeChatBlock,
  type NativeChatEditPatch,
  type NativeChatEditPatchHunk,
  type NativeChatMessage
} from '../../shared/native-chat-types'
import {
  asRecord,
  extractString,
  parseJsonObject,
  timestampMs
} from '../ai-vault/session-scanner-values'
import { imageSourcePathFromText } from '../../shared/native-chat-image-transcript-markers'
import { isHarnessTurnOpenerText } from '../../shared/harness-injected-user-turns'
import { claudeContentBlocks, claudeThinkingOnlyBlocks } from './transcript-record-blocks'
import { unwrapClaudePastedContentBlock } from '../../shared/claude-pasted-content'
import { unwrapClaudeBashInputBlock } from '../../shared/claude-bash-input'
import { claudeInterruptedMessageId } from './transcript-turn-markers'
import { claudeAbsorbedPromptBlocks } from './transcript-claude-absorbed-prompt'

const MAX_EDIT_PATCH_HUNKS = 40
const MAX_EDIT_PATCH_HUNK_LINES = 400

/** Render resolved result hunks; call-side snippet pairs cannot supply real file line numbers. */
function claudeEditPatch(record: Record<string, unknown>): NativeChatEditPatch | null {
  const result = asRecord(record.toolUseResult)
  const raw = result?.structuredPatch
  if (!Array.isArray(raw) || raw.length === 0) {
    return null
  }
  const hunks: NativeChatEditPatchHunk[] = []
  for (const entry of raw.slice(0, MAX_EDIT_PATCH_HUNKS)) {
    const hunk = asRecord(entry)
    const lines = hunk?.lines
    if (
      typeof hunk?.oldStart !== 'number' ||
      typeof hunk.newStart !== 'number' ||
      !Array.isArray(lines)
    ) {
      continue
    }
    hunks.push({
      oldStart: hunk.oldStart,
      oldLines: typeof hunk.oldLines === 'number' ? hunk.oldLines : 0,
      newStart: hunk.newStart,
      newLines: typeof hunk.newLines === 'number' ? hunk.newLines : 0,
      lines: lines
        .slice(0, MAX_EDIT_PATCH_HUNK_LINES)
        .flatMap((line) => (typeof line === 'string' ? [line] : []))
    })
  }
  if (hunks.length === 0) {
    return null
  }
  const filePath = extractString(result?.filePath)
  return { ...(filePath ? { filePath } : {}), hunks }
}

function withEditPatch(blocks: NativeChatBlock[], patch: NativeChatEditPatch): NativeChatBlock[] {
  let attached = false
  return blocks.map((block) => {
    if (attached || block.type !== 'tool-result') {
      return block
    }
    attached = true
    return { ...block, editPatch: patch }
  })
}

export function decodeClaudeTranscriptLine(
  line: string,
  fallbackId: string
): NativeChatMessage | null {
  const parsed = parseJsonObject(line)
  if (!parsed) {
    return null
  }
  const record = claudeQueuedPromptAsUserRecord(parsed) ?? parsed
  const role = record.type
  if (role === 'attachment') {
    const absorbed = claudeAbsorbedPromptBlocks(record)
    return absorbed
      ? {
          id: extractString(record.uuid) ?? fallbackId,
          role: 'user',
          blocks: absorbed.map(unwrapClaudePastedContentBlock),
          timestamp: parseTimestamp(record.timestamp),
          source: 'transcript'
        }
      : null
  }
  if (role !== 'user' && role !== 'assistant') {
    return null
  }
  const timestamp = parseTimestamp(record.timestamp)
  const recordMessageId = extractString(record.uuid) ?? fallbackId
  // parentUuid pairs local command output with its command row.
  const parentUuid = extractString(record.parentUuid)
  const parent = parentUuid ? { parentId: parentUuid } : {}
  if (claudeInterruptedMessageId(record)) {
    // Render injected interruption text as quiet status rather than a user bubble.
    return {
      id: recordMessageId,
      role: 'system',
      blocks: [{ type: 'text', text: NATIVE_CHAT_INTERRUPTED_STATUS_TEXT }],
      timestamp,
      source: 'transcript',
      ...parent
    }
  }
  const message = asRecord(record.message)
  if (role === 'assistant' && isClaudeNoResponseFiller(message)) {
    // Why: the harness's stand-in reply to a meta turn. Drawn, it is the newest prose of the
    // turn it lands in, so it would stand as that turn's answer and fold the real reply away.
    return null
  }
  const thought = role === 'assistant' ? claudeThinkingOnlyBlocks(message?.content) : null
  if (thought) {
    return {
      id: extractString(record.uuid) ?? extractString(message?.id) ?? fallbackId,
      role: 'reasoning',
      blocks: thought,
      timestamp,
      source: 'transcript'
    }
  }
  const editPatch = claudeEditPatch(record)
  const contentBlocks = claudeContentBlocks(message?.content)
  const decodedBlocks = editPatch ? withEditPatch(contentBlocks, editPatch) : contentBlocks
  if (decodedBlocks.length === 0) {
    return null
  }
  // Meta user turns may still contain genuine tool output.
  const isInjectedUserTurn =
    role === 'user' &&
    (record.isMeta === true || record.isSynthetic === true || record.isCompactSummary === true)
  // Keep image-source companions despite isMeta: prompt base64 has no path and cannot render attachments.
  // A peer session's hand-back arrives as a meta turn the agent answers. It still draws
  // nothing, but it is the boundary that keeps that answer out of the previous turn.
  const blocks = isInjectedUserTurn
    ? isImageSourceRecord(decodedBlocks) ||
      (record.isMeta === true && isHarnessTurnOpenerRecord(decodedBlocks))
      ? decodedBlocks
      : decodedBlocks.filter((block) => block.type === 'tool-result')
    : decodedBlocks
  if (blocks.length === 0) {
    return null
  }
  const messageId = extractString(record.uuid) ?? extractString(message?.id)
  return {
    id: messageId ?? fallbackId,
    role: claudeMessageRole(role, blocks, message?.content),
    // Decode ! command echoes so harness filtering cannot hide them and strand the local echo.
    blocks:
      role === 'user'
        ? blocks.map((block) => unwrapClaudeBashInputBlock(unwrapClaudePastedContentBlock(block)))
        : blocks,
    timestamp,
    source: 'transcript',
    ...parent
  }
}

function isClaudeNoResponseFiller(message: Record<string, unknown> | null): boolean {
  if (message?.model !== '<synthetic>') {
    return false
  }
  const content = message.content
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content) && content.length === 1
        ? asRecord(content[0])?.text
        : undefined
  return typeof text === 'string' && text.trim() === 'No response requested.'
}

function isHarnessTurnOpenerRecord(blocks: NativeChatBlock[]): boolean {
  const first = blocks[0]
  return (
    first?.type === 'text' &&
    blocks.every((block) => block.type === 'text') &&
    isHarnessTurnOpenerText(first.text)
  )
}

/** Mid-turn human prompts exist only as queued_command attachments; decode them to reconcile local echoes. */
function claudeQueuedPromptAsUserRecord(
  record: Record<string, unknown>
): Record<string, unknown> | null {
  if (record.type !== 'attachment') {
    return null
  }
  const attachment = asRecord(record.attachment)
  if (attachment?.type !== 'queued_command' || attachment.commandMode !== 'prompt') {
    return null
  }
  // Legacy prompt-mode queue entries omit origin and are human-authored.
  const originKind = asRecord(attachment.origin)?.kind
  if (originKind !== undefined && originKind !== 'human') {
    return null
  }
  const prompt = attachment.prompt
  if (typeof prompt !== 'string' && !Array.isArray(prompt)) {
    return null
  }
  return { ...record, type: 'user', message: { role: 'user', content: prompt } }
}

// Mixed prose/markers are injected turns, never image-source companions.
function isImageSourceRecord(blocks: NativeChatBlock[]): boolean {
  return (
    blocks.length > 0 &&
    blocks.every((block) => block.type === 'text' && imageSourcePathFromText(block.text) !== null)
  )
}

function claudeMessageRole(
  role: 'user' | 'assistant',
  blocks: NativeChatBlock[],
  content: unknown
): NativeChatMessage['role'] {
  if (role === 'user') {
    const onlyToolResults = blocks.every((block) => block.type === 'tool-result')
    return onlyToolResults && blocks.length > 0 ? 'tool' : 'user'
  }
  return isThinkingOnlyContent(content) ? 'reasoning' : role
}

// Decoded thinking becomes a text block, so classify from the raw content parts.
function isThinkingOnlyContent(content: unknown): boolean {
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((part) => {
      const type = asRecord(part)?.type
      return type === 'thinking' || type === 'redacted_thinking'
    })
  )
}

function parseTimestamp(value: unknown): number | null {
  const parsed = timestampMs(value)
  return Number.isFinite(parsed) ? parsed : null
}
