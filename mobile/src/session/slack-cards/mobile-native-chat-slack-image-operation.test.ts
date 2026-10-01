import { describe, expect, it, vi } from 'vitest'
import type { RpcResponse } from '../../transport/types'
import { fetchMobileNativeChatSlackImage } from './mobile-native-chat-slack-image-operation'

const IMAGE = {
  src: 'data:image/png;base64,iVBORw0KGgo=',
  mimeType: 'image/png',
  width: 1024,
  height: 683,
  byteLength: 8
}

function client(reply: () => Promise<RpcResponse>) {
  return { sendRequest: vi.fn(reply) }
}

function success(result: unknown): RpcResponse {
  return { id: '1', ok: true, result }
}

function failure(code: string): RpcResponse {
  return { id: '1', ok: false, error: { code, message: code } }
}

describe('fetchMobileNativeChatSlackImage', () => {
  it('asks the host for the cache-relative path and variant', async () => {
    const host = client(async () => success(IMAGE))
    await expect(
      fetchMobileNativeChatSlackImage(host, 'FFAKE0005/mock.png', 'thumbnail')
    ).resolves.toEqual(IMAGE)
    expect(host.sendRequest).toHaveBeenCalledWith(
      'nativeChat.slackImage',
      { path: 'FFAKE0005/mock.png', variant: 'thumbnail' },
      expect.objectContaining({ failWhenDisconnected: true })
    )
  })

  it.each([
    ['an old host', async () => failure('method_not_found')],
    ['an old desktop that forbids the method', async () => failure('forbidden')],
    ['a refusal', async () => success(null)],
    ['a non-image reply', async () => success({ ...IMAGE, src: 'data:text/html;base64,PGI+' })],
    [
      'a lost connection',
      async (): Promise<RpcResponse> => {
        throw new Error('disconnected')
      }
    ]
  ])('reads %s as no image', async (_name, reply) => {
    await expect(
      fetchMobileNativeChatSlackImage(client(reply), 'a.png', 'full')
    ).resolves.toBeNull()
  })
})
