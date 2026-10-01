import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type * as os from 'node:os'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { MOBILE_RPC_METHOD_ALLOWLIST } from '../../runtime-rpc/runtime-rpc-mobile-method-allowlist'
import { ALL_RPC_METHODS } from './index'
import { NATIVE_CHAT_SLACK_METHODS } from './native-chat-slack'

const home = vi.hoisted(() => ({ dir: '' }))
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>()
  return { ...actual, homedir: () => home.dir }
})

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 1)
])

function request(params: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method: 'nativeChat.slackImage', params }
}

function dispatcher(): RpcDispatcher {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the method never reads the runtime.
  const runtime = { getRuntimeId: () => 'test-runtime' } as unknown as OrcaRuntimeService
  return new RpcDispatcher({ runtime, methods: NATIVE_CHAT_SLACK_METHODS })
}

beforeEach(() => {
  home.dir = mkdtempSync(path.join(tmpdir(), 'slack-image-rpc-'))
  const cache = path.join(home.dir, 'Library', 'Caches', 'slack-mcp', 'files')
  mkdirSync(path.join(cache, 'FFAKE0001'), { recursive: true })
  writeFileSync(path.join(cache, 'FFAKE0001', 'shot.png'), PNG)
  writeFileSync(path.join(home.dir, 'outside.png'), PNG)
})

afterEach(() => {
  rmSync(home.dir, { recursive: true, force: true })
})

describe('nativeChat.slackImage', () => {
  it('is registered and open to paired phones', () => {
    expect(ALL_RPC_METHODS.some((method) => method.name === 'nativeChat.slackImage')).toBe(true)
    expect(MOBILE_RPC_METHOD_ALLOWLIST.has('nativeChat.slackImage')).toBe(true)
  })

  it('serves an image from the host cache', async () => {
    const response = await dispatcher().dispatch(
      request({ path: 'FFAKE0001/shot.png', variant: 'thumbnail' })
    )
    expect(response).toMatchObject({
      ok: true,
      result: { mimeType: 'image/png', src: `data:image/png;base64,${PNG.toString('base64')}` }
    })
  })

  it.each([
    ['a traversal', '../../../outside.png'],
    ['an absolute path outside the cache', 'OUTSIDE'],
    ['a missing file', 'FFAKE0001/gone.png'],
    ['a wrong extension', 'FFAKE0001/shot.txt']
  ])('answers null for %s', async (_name, requested) => {
    const pathParam = requested === 'OUTSIDE' ? path.join(home.dir, 'outside.png') : requested
    const response = await dispatcher().dispatch(request({ path: pathParam, variant: 'full' }))
    expect(response).toMatchObject({ ok: true, result: null })
  })

  it('answers null when the cache root is absent', async () => {
    rmSync(path.join(home.dir, 'Library'), { recursive: true })
    const response = await dispatcher().dispatch(
      request({ path: 'FFAKE0001/shot.png', variant: 'thumbnail' })
    )
    expect(response).toMatchObject({ ok: true, result: null })
  })

  it('rejects params outside the schema', async () => {
    for (const params of [
      { path: 'FFAKE0001/shot.png' },
      { path: 'FFAKE0001/shot.png', variant: 'original' },
      { path: '', variant: 'full' },
      { path: 'x'.repeat(1025), variant: 'full' }
    ]) {
      expect(await dispatcher().dispatch(request(params))).toMatchObject({ ok: false })
    }
  })
})
