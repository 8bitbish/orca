// Which terminal is each workspace's Runs tab, remembered across reloads so a run
// reuses it instead of opening another. A handle is only a hint: the engine asks the
// host whether it is still that workspace's live terminal before typing into it.

import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'

const STORAGE_KEY = 'orca:nativeChatShellRunTerminals:v1'
const MAX_ENTRIES = 50

function cacheKey(target: RuntimeClientTarget, worktreeId: string): string {
  return `${target.kind === 'local' ? 'local' : `env:${target.environmentId}`}|${worktreeId}`
}

function read(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

export function createNativeChatShellRunTerminalCache() {
  return {
    get(target: RuntimeClientTarget, worktreeId: string): string | null {
      return read()[cacheKey(target, worktreeId)] ?? null
    },
    set(target: RuntimeClientTarget, worktreeId: string, handle: string): void {
      const key = cacheKey(target, worktreeId)
      const entries = Object.entries(read()).filter(([existing]) => existing !== key)
      entries.push([key, handle])
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(Object.fromEntries(entries.slice(-MAX_ENTRIES)))
        )
      } catch {
        // Blocked storage: the next run opens a fresh Runs tab instead of reusing this one.
      }
    }
  }
}
