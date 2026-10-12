import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSlackCacheNames } from './slack-cache-names'

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'slack-cache-names-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeUsers(users: Record<string, unknown>): void {
  writeFileSync(path.join(root, 'users.json'), JSON.stringify(users))
}

describe('readSlackCacheNames', () => {
  it('returns display names for only the ids asked for, real name as a fallback', async () => {
    writeUsers({
      UFAKE0010: { info: { id: 'UFAKE0010', name: 'Ada', realName: 'Ada Lovelace' }, cachedAt: 1 },
      UFAKE0011: { info: { id: 'UFAKE0011', name: '', realName: 'Linus Pauling' }, cachedAt: 1 },
      UFAKE0012: { info: { id: 'UFAKE0012', name: 'Grace' }, cachedAt: 1 }
    })
    writeFileSync(
      path.join(root, 'channels.json'),
      JSON.stringify({ CFAKE0013: { name: 'launch', cachedAt: 1 } })
    )
    await expect(
      readSlackCacheNames(
        { userIds: ['UFAKE0010', 'UFAKE0011', 'UFAKE0099'], channelIds: ['CFAKE0013'] },
        root
      )
    ).resolves.toEqual({
      users: { UFAKE0010: 'Ada', UFAKE0011: 'Linus Pauling' },
      channels: { CFAKE0013: 'launch' }
    })
  })

  it('names nothing when the cache is missing or unreadable', async () => {
    const request = { userIds: ['UFAKE0010'], channelIds: ['CFAKE0013'] }
    await expect(readSlackCacheNames(request, root)).resolves.toEqual({ users: {}, channels: {} })
    writeFileSync(path.join(root, 'users.json'), '{not json')
    await expect(readSlackCacheNames(request, root)).resolves.toEqual({ users: {}, channels: {} })
  })

  it('re-reads the file after slack-mcp rewrites it', async () => {
    writeUsers({ UFAKE0010: { info: { name: 'Ada' } } })
    const request = { userIds: ['UFAKE0010'], channelIds: [] }
    await expect(readSlackCacheNames(request, root)).resolves.toMatchObject({
      users: { UFAKE0010: 'Ada' }
    })
    writeUsers({ UFAKE0010: { info: { name: 'Ada L.' } } })
    await expect(readSlackCacheNames(request, root)).resolves.toMatchObject({
      users: { UFAKE0010: 'Ada L.' }
    })
  })
})
