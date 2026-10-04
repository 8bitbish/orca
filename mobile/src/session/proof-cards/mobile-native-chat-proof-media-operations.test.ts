import { describe, expect, it, vi } from 'vitest'
import type { RpcResponse } from '../../transport/types'
import { createMobileNativeChatProofMediaHost } from './mobile-native-chat-proof-media-operations'

function client(reply: () => Promise<RpcResponse>) {
  return { sendRequest: vi.fn(reply) }
}

function success(result: unknown): RpcResponse {
  return { id: '1', ok: true, result }
}

const INFO = { ok: true, type: 'video', mimeType: 'video/mp4', byteLength: 3, mtimeMs: 5 }
const READ = { path: 'a/flow.mp4', offset: 0, length: 3, byteLength: 3, mtimeMs: 5 }

describe('proof media host calls', () => {
  it('asks the host for the proof-folder-relative path', async () => {
    const host = client(async () => success(INFO))
    await expect(createMobileNativeChatProofMediaHost(host).info('a/flow.mp4')).resolves.toEqual(
      INFO
    )
    expect(host.sendRequest).toHaveBeenCalledWith(
      'nativeChat.proofMediaInfo',
      { path: 'a/flow.mp4' },
      expect.objectContaining({ failWhenDisconnected: true })
    )
  })

  it('passes a typed refusal through', async () => {
    const host = createMobileNativeChatProofMediaHost(
      client(async () => success({ ok: false, reason: 'outside-folder' }))
    )
    await expect(host.info('x.mp4')).resolves.toEqual({ ok: false, reason: 'outside-folder' })
  })

  it('accepts a slice whose base64 matches its length', async () => {
    const slice = { ok: true, base64: 'AAEC', offset: 0, bytesRead: 3, eof: true }
    const host = createMobileNativeChatProofMediaHost(client(async () => success(slice)))
    await expect(host.read(READ)).resolves.toEqual(slice)
  })

  it.each([
    [
      'an old host',
      async (): Promise<RpcResponse> => ({
        id: '1',
        ok: false,
        error: { code: 'method_not_found', message: 'x' }
      })
    ],
    [
      'a forbidden call',
      async (): Promise<RpcResponse> => ({
        id: '1',
        ok: false,
        error: { code: 'forbidden', message: 'x' }
      })
    ],
    [
      'a torn slice',
      async () => success({ ok: true, base64: 'AAEC', offset: 0, bytesRead: 9, eof: true })
    ],
    ['a null reply', async () => success(null)],
    [
      'a lost connection',
      async (): Promise<RpcResponse> => {
        throw new Error('disconnected')
      }
    ]
  ])('reads %s as unavailable on every call', async (_name, reply) => {
    const host = createMobileNativeChatProofMediaHost(client(reply))
    await expect(host.info('a.mp4')).resolves.toEqual({ ok: false, reason: 'unavailable' })
    await expect(host.read(READ)).resolves.toEqual({ ok: false, reason: 'unavailable' })
    await expect(host.thumbnail('a.png')).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })
})
