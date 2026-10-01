// Where chat Runs live: in memory while the app runs (rows unmount under windowing,
// runs do not), and the last run of each block in localStorage so its status and
// truncated output survive a reload. A run still in flight at reload comes back
// `unverifiable`: Orca stopped watching it, so it cannot say how it ended.

import { useSyncExternalStore } from 'react'
import {
  NATIVE_CHAT_SHELL_RUN_IDLE,
  isNativeChatShellRunActive,
  reduceNativeChatShellRun,
  type NativeChatShellRunEvent,
  type NativeChatShellRunPhase,
  type NativeChatShellRunState
} from '../../../../shared/native-chat-shell-run-state'

const STORAGE_KEY = 'orca:nativeChatShellRuns:v1'
const MAX_RECORDS = 100
const ACTIVE_PERSIST_MS = 2_000
const PHASES: ReadonlySet<string> = new Set<NativeChatShellRunPhase>([
  'starting',
  'running',
  'stopping',
  'succeeded',
  'failed',
  'stopped',
  'unverifiable',
  'error'
])

type StoredRun = NativeChatShellRunState & { updatedAt: number }

const runs = new Map<string, NativeChatShellRunState>()
const keyListeners = new Map<string, Set<() => void>>()
const lockListeners = new Set<() => void>()
/** Workspace -> the run key typing into its Runs terminal right now. */
const workspaceLocks = new Map<string, string>()
let stored: Record<string, StoredRun> | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

/** One record per (session, message, block). */
export function nativeChatShellRunKey(
  sessionId: string,
  messageId: string,
  blockIndex: number
): string {
  return `${sessionId}:${messageId}:${blockIndex}`
}

function isStoredRun(value: unknown): value is StoredRun {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record: Partial<Record<keyof StoredRun, unknown>> = value
  return (
    typeof record.phase === 'string' &&
    PHASES.has(record.phase) &&
    typeof record.output === 'string' &&
    typeof record.updatedAt === 'number'
  )
}

function readStored(): Record<string, StoredRun> {
  if (stored) {
    return stored
  }
  stored = {}
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof parsed === 'object' && parsed !== null) {
      for (const [key, value] of Object.entries(parsed)) {
        if (isStoredRun(value)) {
          const run = { ...NATIVE_CHAT_SHELL_RUN_IDLE, ...value }
          stored[key] = isNativeChatShellRunActive(run.phase)
            ? { ...run, phase: 'unverifiable', problem: 'reloaded', needsInput: null }
            : run
        }
      }
    }
  } catch {
    // Unreadable or blocked storage: runs still work, they just will not survive a reload.
  }
  return stored
}

function writeStored(): void {
  persistTimer = null
  const records = readStored()
  const kept = Object.entries(records)
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, MAX_RECORDS)
  stored = Object.fromEntries(kept)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Full or blocked storage: the run itself is unaffected.
  }
}

function persist(key: string, state: NativeChatShellRunState): void {
  readStored()[key] = { ...state, updatedAt: Date.now() }
  if (!isNativeChatShellRunActive(state.phase)) {
    if (persistTimer !== null) {
      clearTimeout(persistTimer)
    }
    writeStored()
  } else if (persistTimer === null) {
    persistTimer = setTimeout(writeStored, ACTIVE_PERSIST_MS)
  }
}

export function getNativeChatShellRun(key: string): NativeChatShellRunState {
  const live = runs.get(key)
  if (live) {
    return live
  }
  const record = readStored()[key]
  if (!record) {
    return NATIVE_CHAT_SHELL_RUN_IDLE
  }
  const { updatedAt: _updatedAt, ...state } = record
  runs.set(key, state)
  return state
}

export function dispatchNativeChatShellRun(
  key: string,
  event: NativeChatShellRunEvent
): NativeChatShellRunState {
  const before = getNativeChatShellRun(key)
  const after = reduceNativeChatShellRun(before, event)
  if (after !== before) {
    runs.set(key, after)
    persist(key, after)
    for (const listener of keyListeners.get(key) ?? []) {
      listener()
    }
  }
  return after
}

export function subscribeNativeChatShellRun(key: string, listener: () => void): () => void {
  const listeners = keyListeners.get(key) ?? new Set()
  listeners.add(listener)
  keyListeners.set(key, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      keyListeners.delete(key)
    }
  }
}

export function useNativeChatShellRun(key: string | null): NativeChatShellRunState {
  return useSyncExternalStore(
    (listener) => (key === null ? () => {} : subscribeNativeChatShellRun(key, listener)),
    () => (key === null ? NATIVE_CHAT_SHELL_RUN_IDLE : getNativeChatShellRun(key))
  )
}

/** Claims the workspace's Runs terminal for `key`; false when another run holds it. */
export function claimNativeChatShellRunWorkspace(worktreeId: string, key: string): boolean {
  const holder = workspaceLocks.get(worktreeId)
  if (holder !== undefined && holder !== key) {
    return false
  }
  workspaceLocks.set(worktreeId, key)
  lockListeners.forEach((listener) => listener())
  return true
}

export function releaseNativeChatShellRunWorkspace(worktreeId: string, key: string): void {
  if (workspaceLocks.get(worktreeId) === key) {
    workspaceLocks.delete(worktreeId)
    lockListeners.forEach((listener) => listener())
  }
}

/** True while a different block's run is typing into this workspace's Runs terminal. */
export function useNativeChatShellRunWorkspaceBusy(
  worktreeId: string | null,
  key: string | null
): boolean {
  return useSyncExternalStore(
    (listener) => {
      lockListeners.add(listener)
      return () => lockListeners.delete(listener)
    },
    () => {
      const holder = worktreeId === null ? undefined : workspaceLocks.get(worktreeId)
      return holder !== undefined && holder !== key
    }
  )
}

/** Test seam: forget everything, including what localStorage held when first read. */
export function resetNativeChatShellRunStoreForTests(): void {
  runs.clear()
  keyListeners.clear()
  workspaceLocks.clear()
  stored = null
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
}
