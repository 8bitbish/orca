// Display names for Slack mention ids, read from slack-mcp's user and channel caches
// on this host (users.json, channels.json beside the image folder). Only the names
// asked for leave this module, and it never touches the network: an id slack-mcp
// has not seen stays unnamed.

import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { SLACK_MCP_CACHE_HOME_RELATIVE } from '../../shared/native-chat-slack-image-path'
import {
  cleanNativeChatSlackName,
  NATIVE_CHAT_SLACK_NAMES_MAX_IDS,
  type NativeChatSlackNamesRequest,
  type NativeChatSlackNamesResult
} from '../../shared/native-chat-slack-names-contract'

const MAX_CACHE_FILE_BYTES = 8 * 1024 * 1024

type NameTable = ReadonlyMap<string, string>
type Parsed = { mtimeMs: number; size: number; table: NameTable }

const parsedByPath = new Map<string, Parsed>()

export function slackCacheNamesRoot(): string {
  return path.join(homedir(), ...SLACK_MCP_CACHE_HOME_RELATIVE)
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

// users.json: { U…: { info: { name, realName } } }; `name` is the display name.
function userName(entry: unknown): string | null {
  const info = record(record(entry)?.info)
  return cleanNativeChatSlackName(info?.name) ?? cleanNativeChatSlackName(info?.realName)
}

// channels.json: { C…: { name } }.
function channelName(entry: unknown): string | null {
  return cleanNativeChatSlackName(record(entry)?.name)
}

/** The id → name table in one cache file, re-read only when the file changes. */
async function readTable(
  filePath: string,
  nameOf: (entry: unknown) => string | null
): Promise<NameTable> {
  const info = await stat(filePath).catch(() => null)
  if (!info?.isFile() || info.size > MAX_CACHE_FILE_BYTES) {
    return new Map()
  }
  const cached = parsedByPath.get(filePath)
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
    return cached.table
  }
  const table = new Map<string, string>()
  try {
    const entries = record(JSON.parse(await readFile(filePath, 'utf8'))) ?? {}
    for (const [id, entry] of Object.entries(entries)) {
      const name = nameOf(entry)
      if (name !== null) {
        table.set(id, name)
      }
    }
  } catch {
    // slack-mcp may be mid-write; an unreadable file names nothing this time.
    return table
  }
  parsedByPath.set(filePath, { mtimeMs: info.mtimeMs, size: info.size, table })
  return table
}

function pick(table: NameTable, ids: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of ids.slice(0, NATIVE_CHAT_SLACK_NAMES_MAX_IDS)) {
    const name = table.get(id)
    if (name !== undefined) {
      out[id] = name
    }
  }
  return out
}

export async function readSlackCacheNames(
  request: NativeChatSlackNamesRequest,
  root: string = slackCacheNamesRoot()
): Promise<NativeChatSlackNamesResult> {
  const [users, channels] = await Promise.all([
    request.userIds.length === 0
      ? new Map<string, string>()
      : readTable(path.join(root, 'users.json'), userName),
    request.channelIds.length === 0
      ? new Map<string, string>()
      : readTable(path.join(root, 'channels.json'), channelName)
  ])
  return { users: pick(users, request.userIds), channels: pick(channels, request.channelIds) }
}
