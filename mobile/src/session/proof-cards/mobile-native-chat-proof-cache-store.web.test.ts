import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExpoMobileNativeChatProofCacheStore } from './mobile-native-chat-proof-cache-store.web'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('web proof cache store', () => {
  it('keeps finished parts in memory as blob URLs and frees them on remove', () => {
    let next = 0
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: () => `blob:${(next += 1)}`, revokeObjectURL: revoke })
    const store = createExpoMobileNativeChatProofCacheStore()
    store.startPart('a.png')
    store.appendPart('a.png', btoa('abc'))
    store.appendPart('a.png', btoa('de'))
    expect(store.partSize('a.png')).toBe(5)
    expect(store.finishedSize('a.png')).toBeNull()
    store.finishPart('a.png')
    expect(store.finishedSize('a.png')).toBe(5)
    expect(store.uri('a.png')).toBe('blob:1')
    expect(store.list()).toEqual([{ name: 'a.png', size: 5, modifiedMs: expect.any(Number) }])
    store.startPart('b.png')
    store.discardPart('b.png')
    expect(store.list()).toHaveLength(1)
    store.remove('a.png')
    expect(revoke).toHaveBeenCalledWith('blob:1')
    expect(store.finishedSize('a.png')).toBeNull()
  })
})
