import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readNativeChatTranscript } from './transcript-reader'
import { isNoiseMessage } from '../../shared/native-chat/native-chat-noise'
import {
  nativeChatLineDecoderForAgent,
  readNativeChatTranscriptTailFile
} from './transcript-tail-reader'

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

function jsonLines(records: unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n')
}

async function writeFixture(prefix: string, records: unknown[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  tempRoots.push(root)
  const filePath = join(root, 'transcript.jsonl')
  await writeFile(filePath, jsonLines(records))
  return filePath
}

describe('readNativeChatTranscript (claude)', () => {
  it('keeps a meta peer hand-back as a turn boundary and drops the synthetic filler reply', async () => {
    const filePath = await writeFixture('orca-native-chat-claude-peer-', [
      {
        type: 'user',
        uuid: 'u-peer',
        isMeta: true,
        origin: { kind: 'peer' },
        timestamp: '2026-06-01T10:00:00.000Z',
        message: {
          role: 'user',
          content: 'Another Claude session sent a message:\n<agent-message from="a41">report'
        }
      },
      {
        type: 'assistant',
        uuid: 'a-filler',
        timestamp: '2026-06-01T10:00:01.000Z',
        message: {
          role: 'assistant',
          model: '<synthetic>',
          content: [{ type: 'text', text: 'No response requested.' }]
        }
      },
      {
        type: 'assistant',
        uuid: 'a-synthetic-error',
        timestamp: '2026-06-01T10:00:02.000Z',
        message: {
          role: 'assistant',
          model: '<synthetic>',
          content: [{ type: 'text', text: "You've hit your org's monthly spend limit" }]
        }
      }
    ])
    const result = await readNativeChatTranscript('claude', 'sess', { filePath })
    if (!('messages' in result)) {
      throw new Error('expected messages')
    }
    expect(result.messages.map((m) => [m.id, m.role])).toEqual([
      ['u-peer', 'user'],
      ['a-synthetic-error', 'assistant']
    ])
    expect(isNoiseMessage(result.messages[0])).toBe(true)
  })

  it('keeps signed-empty and redacted thinking records as thought markers', async () => {
    const filePath = await writeFixture('orca-native-chat-claude-empty-think-', [
      {
        type: 'user',
        uuid: 'u-1',
        timestamp: '2026-10-01T05:17:20.918Z',
        message: { role: 'user', content: 'this is me testing' }
      },
      {
        type: 'assistant',
        uuid: 'a-think',
        timestamp: '2026-10-01T05:17:22.876Z',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [{ type: 'thinking', thinking: '', signature: 'CAQSxwUKEAgSGAI4AUII' }]
        }
      },
      {
        type: 'assistant',
        uuid: 'a-redacted',
        timestamp: '2026-10-01T05:17:23.000Z',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [{ type: 'redacted_thinking', data: 'x' }]
        }
      },
      {
        type: 'assistant',
        uuid: 'a-text',
        timestamp: '2026-10-01T05:17:24.188Z',
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: '', signature: 'sig' },
            { type: 'text', text: 'Hi.' }
          ]
        }
      }
    ])
    const result = await readNativeChatTranscript('claude', 'sess', { filePath })
    if (!('messages' in result)) {
      throw new Error('expected messages')
    }
    expect(result.messages.map(({ id, role, blocks }) => ({ id, role, blocks }))).toEqual([
      { id: 'u-1', role: 'user', blocks: [{ type: 'text', text: 'this is me testing' }] },
      { id: 'a-think', role: 'reasoning', blocks: [{ type: 'text', text: '' }] },
      { id: 'a-redacted', role: 'reasoning', blocks: [{ type: 'text', text: '' }] },
      // Beside real content an empty thought adds nothing.
      { id: 'a-text', role: 'assistant', blocks: [{ type: 'text', text: 'Hi.' }] }
    ])
  })
})

describe('readNativeChatTranscriptTailFile', () => {
  it('windows to nothing for a non-positive limit instead of the whole tail', async () => {
    const decode = nativeChatLineDecoderForAgent('claude')!
    const filePath = await writeFixture('orca-native-chat-tail-limit-', [
      {
        type: 'assistant',
        uuid: 'a-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'one' }] }
      },
      {
        type: 'assistant',
        uuid: 'a-2',
        message: { role: 'assistant', content: [{ type: 'text', text: 'two' }] }
      }
    ])

    const result = await readNativeChatTranscriptTailFile(filePath, 0, decode, true)

    expect(result.messages).toEqual([])
    expect(result.hasMore).toBe(false)
  })
})
