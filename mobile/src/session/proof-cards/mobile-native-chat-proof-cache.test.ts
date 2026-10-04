import { describe, expect, it } from 'vitest'
import {
  mobileNativeChatProofCacheName,
  planMobileNativeChatProofCachePrune,
  pruneMobileNativeChatProofCache,
  type MobileNativeChatProofCacheStore
} from './mobile-native-chat-proof-cache'

const DAY = 24 * 60 * 60 * 1000
const MB = 1024 * 1024
const NOW = 1_800_000_000_000

describe('proof cache names', () => {
  const base = {
    hostId: 'host-a',
    path: 'demo/2026-10-04-fake/flow.mp4',
    mtimeMs: 1_700_000_000_000.4,
    byteLength: 1234,
    mimeType: 'video/mp4'
  } as const

  it('keys by host, path, mtime and size, with the type as the extension', () => {
    const name = mobileNativeChatProofCacheName(base)
    expect(name).toMatch(/^[0-9a-f]{32}-1700000000000-1234\.mp4$/)
    expect(mobileNativeChatProofCacheName({ ...base, mtimeMs: base.mtimeMs + 5000 })).not.toBe(name)
    expect(mobileNativeChatProofCacheName({ ...base, byteLength: 1235 })).not.toBe(name)
    expect(mobileNativeChatProofCacheName({ ...base, hostId: 'host-b' })).not.toBe(name)
    expect(mobileNativeChatProofCacheName({ ...base, mimeType: 'image/jpeg' })).toMatch(/\.jpg$/)
  })
})

describe('proof cache pruning', () => {
  it('drops files older than 30 days and stale partial downloads', () => {
    expect(
      planMobileNativeChatProofCachePrune(
        [
          { name: 'old.mp4', size: MB, modifiedMs: NOW - 31 * DAY },
          { name: 'fresh.mp4', size: MB, modifiedMs: NOW - DAY },
          { name: 'stale.mp4.part', size: MB, modifiedMs: NOW - 2 * 60 * 60 * 1000 },
          { name: 'running.mp4.part', size: MB, modifiedMs: NOW - 60 * 1000 }
        ],
        NOW
      )
    ).toEqual(['old.mp4', 'stale.mp4.part'])
  })

  it('then deletes the oldest files until the rest fit in 200 MB', () => {
    expect(
      planMobileNativeChatProofCachePrune(
        [
          { name: 'newest.mp4', size: 120 * MB, modifiedMs: NOW - DAY },
          { name: 'oldest.mp4', size: 40 * MB, modifiedMs: NOW - 5 * DAY },
          { name: 'middle.mp4', size: 90 * MB, modifiedMs: NOW - 3 * DAY }
        ],
        NOW
      )
    ).toEqual(['oldest.mp4', 'middle.mp4'])
  })

  it('keeps going past a file it cannot delete, and never throws', () => {
    const removed: string[] = []
    const store: Pick<MobileNativeChatProofCacheStore, 'list' | 'remove'> = {
      list: () => [
        { name: 'a.mp4', size: 1, modifiedMs: 0 },
        { name: 'b.mp4', size: 1, modifiedMs: 0 }
      ],
      remove: (name) => {
        if (name === 'a.mp4') {
          throw new Error('locked')
        }
        removed.push(name)
      }
    }
    pruneMobileNativeChatProofCache(store, NOW)
    expect(removed).toEqual(['b.mp4'])
    expect(() =>
      pruneMobileNativeChatProofCache(
        {
          list: () => {
            throw new Error('gone')
          },
          remove: () => {}
        },
        NOW
      )
    ).not.toThrow()
  })
})
