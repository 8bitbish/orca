import { describe, expect, it } from 'vitest'
import {
  parseNativeChatProofMediaInfoReply,
  parseNativeChatProofMediaReadReply
} from './native-chat-proof-media-rpc-contract'

const INFO = {
  ok: true,
  type: 'video',
  mimeType: 'video/mp4',
  byteLength: 3012,
  mtimeMs: 1759600000123.25
}

describe('parseNativeChatProofMediaInfoReply', () => {
  it('keeps the documented shape, with size only when both sides are positive integers', () => {
    expect(parseNativeChatProofMediaInfoReply({ ...INFO, extra: 1 })).toEqual(INFO)
    const image = { ...INFO, type: 'image', mimeType: 'image/png' }
    expect(parseNativeChatProofMediaInfoReply({ ...image, width: 390, height: 844 })).toEqual({
      ...image,
      width: 390,
      height: 844
    })
    expect(parseNativeChatProofMediaInfoReply({ ...image, width: 390, height: 0 })).toEqual(image)
  })

  it('degrades a malformed or unknown reply to unavailable', () => {
    for (const value of [
      null,
      'nope',
      { ...INFO, mimeType: 'video/x-matroska' },
      { ...INFO, type: 'image' },
      { ...INFO, byteLength: -1 },
      { ...INFO, mtimeMs: 'yesterday' },
      { ok: false, reason: 'a-newer-reason' }
    ]) {
      expect(parseNativeChatProofMediaInfoReply(value)).toEqual({
        ok: false,
        reason: 'unavailable'
      })
    }
    expect(parseNativeChatProofMediaInfoReply({ ok: false, reason: 'changed' })).toEqual({
      ok: false,
      reason: 'changed'
    })
  })
})

describe('parseNativeChatProofMediaReadReply', () => {
  const bytes = Buffer.from('hello proof')
  const read = { ok: true, base64: bytes.toString('base64'), offset: 0, bytesRead: 11, eof: true }

  it('keeps a slice whose base64 decodes to the length it claims', () => {
    expect(parseNativeChatProofMediaReadReply(read)).toEqual(read)
    expect(
      parseNativeChatProofMediaReadReply({ ...read, base64: '', bytesRead: 0, offset: 11 })
    ).toMatchObject({ ok: true, bytesRead: 0 })
  })

  it('refuses a torn or malformed slice', () => {
    for (const value of [
      { ...read, bytesRead: 12 },
      { ...read, base64: read.base64.slice(0, -4) },
      { ...read, base64: '!!!!' },
      { ...read, eof: 'yes' },
      { ...read, offset: 1.5 }
    ]) {
      expect(parseNativeChatProofMediaReadReply(value)).toEqual({
        ok: false,
        reason: 'unavailable'
      })
    }
    expect(parseNativeChatProofMediaReadReply({ ok: false, reason: 'bad-range' })).toEqual({
      ok: false,
      reason: 'bad-range'
    })
  })
})
