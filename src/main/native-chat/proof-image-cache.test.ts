import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProofImageCache, proofImageCacheKey } from './proof-image-cache'

afterEach(() => {
  vi.useRealTimers()
})

function cache(limits: { maxEntries: number; maxBytes: number; ttlMs?: number }) {
  return new ProofImageCache<string>(limits, (value) => value.length)
}

describe('proofImageCacheKey', () => {
  it('changes with the size, mtime and inode', () => {
    const base = { size: 10, mtimeMs: 1, ino: 7 }
    const key = proofImageCacheKey('/p/a.png', base)
    expect(proofImageCacheKey('/p/a.png', { ...base, size: 11 })).not.toBe(key)
    expect(proofImageCacheKey('/p/a.png', { ...base, mtimeMs: 2 })).not.toBe(key)
    expect(proofImageCacheKey('/p/a.png', { ...base, ino: 8 })).not.toBe(key)
    expect(proofImageCacheKey('/p/b.png', base)).not.toBe(key)
  })
})

describe('ProofImageCache', () => {
  it('evicts the least recently used entry past the entry count', () => {
    const lru = cache({ maxEntries: 2, maxBytes: 100 })
    lru.set('a', 'A')
    lru.set('b', 'B')
    expect(lru.get('a')).toBe('A')
    lru.set('c', 'C')
    expect(lru.get('b')).toBeUndefined()
    expect(lru.get('a')).toBe('A')
    expect(lru.get('c')).toBe('C')
    expect(lru.size).toEqual({ entries: 2, bytes: 2 })
  })

  it('evicts past the byte budget and never keeps one entry larger than it', () => {
    const lru = cache({ maxEntries: 10, maxBytes: 6 })
    lru.set('a', 'aaa')
    lru.set('b', 'bbb')
    lru.set('c', 'cc')
    expect(lru.get('a')).toBeUndefined()
    expect(lru.size).toEqual({ entries: 2, bytes: 5 })
    lru.set('huge', 'x'.repeat(7))
    expect(lru.get('huge')).toBeUndefined()
    expect(lru.size.bytes).toBe(5)
  })

  it('expires entries after the sliding TTL, also without a further call', () => {
    vi.useFakeTimers()
    const lru = cache({ maxEntries: 2, maxBytes: 100, ttlMs: 1000 })
    lru.set('a', 'A')
    vi.advanceTimersByTime(800)
    expect(lru.get('a')).toBe('A')
    vi.advanceTimersByTime(800)
    expect(lru.get('a')).toBe('A')
    vi.advanceTimersByTime(2500)
    expect(lru.size).toEqual({ entries: 0, bytes: 0 })
    expect(lru.get('a')).toBeUndefined()
  })

  it('runs one load for concurrent callers of a key and caches what keep picks', async () => {
    const lru = cache({ maxEntries: 2, maxBytes: 100 })
    let release: (value: string) => void = () => {}
    const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)))
    const first = lru.getOrLoad(
      'k',
      (v) => v,
      load,
      (v) => v
    )
    const second = lru.getOrLoad(
      'k',
      (v) => v,
      load,
      (v) => v
    )
    release('V')
    expect(await Promise.all([first, second])).toEqual(['V', 'V'])
    expect(load).toHaveBeenCalledTimes(1)
    expect(
      await lru.getOrLoad(
        'k',
        (v) => `hit:${v}`,
        load,
        (v) => v
      )
    ).toBe('hit:V')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('caches nothing for a refused or failed load, and retries next time', async () => {
    const lru = cache({ maxEntries: 2, maxBytes: 100 })
    expect(
      await lru.getOrLoad(
        'k',
        (v) => v,
        async () => 'refused',
        () => null
      )
    ).toBe('refused')
    await expect(
      lru.getOrLoad(
        'k',
        (v) => v,
        async () => {
          throw new Error('boom')
        },
        (v) => v
      )
    ).rejects.toThrow('boom')
    expect(
      await lru.getOrLoad(
        'k',
        (v) => v,
        async () => 'ok',
        (v) => v
      )
    ).toBe('ok')
    expect(lru.get('k')).toBe('ok')
  })
})
