// Bounded in-memory caches for proof images on the host, so a proof card's thumbnail,
// size and zoomed regions do not each decode the whole file on Electron's main process.
// Entries are keyed by the file's real path plus its size, mtime and inode, so an edited
// or replaced file is a different key and never served from a stale entry.

export type ProofImageCacheLimits = {
  maxEntries: number
  /** Total of `sizeOf` over every entry; one entry larger than this is never kept. */
  maxBytes: number
  /** Sliding: each hit pushes the expiry back. Omitted means entries only leave by eviction. */
  ttlMs?: number
}

type Entry<T> = { value: T; bytes: number; expiresAt: number }

export function proofImageCacheKey(
  realPath: string,
  stats: { size: number; mtimeMs: number; ino: number }
): string {
  return `${realPath}\0${stats.size}\0${stats.mtimeMs}\0${stats.ino}`
}

/** Holds values of type T; `getOrLoad` answers with R, the reply its callers return. */
export class ProofImageCache<T, R = T> {
  private readonly entries = new Map<string, Entry<T>>()
  private readonly pending = new Map<string, Promise<R>>()
  private totalBytes = 0
  private sweepTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly limits: ProofImageCacheLimits,
    private readonly sizeOf: (value: T) => number
  ) {}

  get size(): { entries: number; bytes: number } {
    return { entries: this.entries.size, bytes: this.totalBytes }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) {
      return undefined
    }
    if (entry.expiresAt <= Date.now()) {
      this.delete(key)
      return undefined
    }
    // Map order is the LRU order: a hit moves the entry to the newest end.
    this.entries.delete(key)
    entry.expiresAt = this.expiry()
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T): void {
    this.delete(key)
    const bytes = this.sizeOf(value)
    if (bytes > this.limits.maxBytes || this.limits.maxEntries < 1) {
      return
    }
    this.entries.set(key, { value, bytes, expiresAt: this.expiry() })
    this.totalBytes += bytes
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limits.maxEntries && this.totalBytes <= this.limits.maxBytes) {
        break
      }
      this.delete(oldest)
    }
    this.scheduleSweep()
  }

  delete(key: string): void {
    const entry = this.entries.get(key)
    if (entry) {
      this.entries.delete(key)
      this.totalBytes -= entry.bytes
    }
  }

  clear(): void {
    this.entries.clear()
    this.pending.clear()
    this.totalBytes = 0
    if (this.sweepTimer) {
      clearTimeout(this.sweepTimer)
      this.sweepTimer = null
    }
  }

  /**
   * The cached value, or `load`'s answer shared by every concurrent caller of one key.
   * `keep` picks what to cache from that answer; null (a refusal, a file that changed
   * mid-read) caches nothing, and a throw reaches every waiting caller uncached.
   */
  async getOrLoad(
    key: string,
    hit: (value: T) => R,
    load: () => Promise<R>,
    keep: (result: R) => T | null
  ): Promise<R> {
    const cached = this.get(key)
    if (cached !== undefined) {
      return hit(cached)
    }
    const inFlight = this.pending.get(key)
    if (inFlight) {
      return inFlight
    }
    const loading = load().then((result) => {
      const value = keep(result)
      if (value !== null) {
        this.set(key, value)
      }
      return result
    })
    this.pending.set(key, loading)
    try {
      return await loading
    } finally {
      this.pending.delete(key)
    }
  }

  private expiry(): number {
    return this.limits.ttlMs === undefined
      ? Number.POSITIVE_INFINITY
      : Date.now() + this.limits.ttlMs
  }

  /** Expired entries are dropped on a timer too, so a large bitmap is not held until the next call. */
  private scheduleSweep(): void {
    const ttl = this.limits.ttlMs
    if (ttl === undefined || this.sweepTimer) {
      return
    }
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = null
      const now = Date.now()
      for (const [key, entry] of this.entries) {
        if (entry.expiresAt <= now) {
          this.delete(key)
        }
      }
      if (this.entries.size > 0) {
        this.scheduleSweep()
      }
    }, ttl)
    this.sweepTimer.unref?.()
  }
}
