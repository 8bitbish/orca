import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import {
  NativeChatFencePreviewContext,
  type NativeChatFencePreviewScope
} from './native-chat-fence-preview'
import {
  NativeChatProjectReplyContext,
  type NativeChatProjectReplyChannel
} from './native-chat-project-reply-context'

// Made-up ids and text only.
export const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export const MESSAGE_CARD = {
  status: 'needs-you',
  teamId: 'TFAKE0001',
  domain: 'acme',
  from: { name: 'Sam', userId: 'UFAKE0002' },
  channel: { name: 'design-review', id: 'CFAKE0003', kind: 'channel' },
  ts: '1700000000.000100',
  sentAt: '2026-10-01T16:47:00+03:00',
  summary: 'Wants a call on the sidebar: overlay or push?',
  text: 'Which do you prefer, *overlay* or _push_? <@UFAKE0004|Alex> agrees',
  images: [{ path: 'FFAKE0005/mock.png', name: 'mock.png', width: 1200, height: 800 }],
  thread: { replies: 3, youReplied: false },
  actions: [
    { label: 'Overlay', reply: 'Draft a reply to Sam going with overlay', style: 'primary' },
    { label: 'Reply…', input: true }
  ]
}

export const DRAFT_CARD = {
  teamId: 'TFAKE0001',
  domain: 'acme',
  to: { name: 'Sam', userId: 'UFAKE0002' },
  channel: { name: 'design-review', id: 'CFAKE0003' },
  threadTs: '1700000000.000100',
  text: 'Going with *overlay*, thanks!',
  actions: [
    { label: 'Send', reply: 'Send the draft to Sam', style: 'primary' },
    { label: 'Edit…', input: true },
    { label: 'Cancel', reply: 'Cancel the draft to Sam' }
  ]
}

export function chatMessage(
  id: string,
  role: NativeChatMessage['role'],
  text: string
): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text }], timestamp: null, source: 'transcript' }
}

export const REPLY_SCOPE: NativeChatFencePreviewScope = {
  markupPreviews: true,
  openFenceBody: null,
  messageId: 'a1'
}

export function renderSlackFence(
  language: 'slack-message' | 'slack-draft',
  source: string,
  channel: NativeChatProjectReplyChannel | null,
  scope: NativeChatFencePreviewScope = REPLY_SCOPE
) {
  return render(
    <NativeChatFencePreviewContext.Provider value={scope}>
      <NativeChatProjectReplyContext.Provider value={channel}>
        <NativeChatCodeBlock language={language}>
          <code>{source}</code>
        </NativeChatCodeBlock>
      </NativeChatProjectReplyContext.Provider>
    </NativeChatFencePreviewContext.Provider>
  )
}

export function stubSlackApi() {
  const api = {
    openSlack: vi.fn(async () => true),
    slackImage: vi.fn(async ({ path }: { path: string }) =>
      path.includes('missing')
        ? null
        : { src: PIXEL_PNG, mimeType: 'image/png', width: 1, height: 1, byteLength: 68 }
    )
  }
  vi.stubGlobal('api', { nativeChat: api })
  return api
}
