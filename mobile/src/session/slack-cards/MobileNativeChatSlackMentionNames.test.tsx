import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatSlackNamesRequest } from '../../../../src/shared/native-chat-slack-names-contract'
import {
  MobileNativeChatMessageIdContext,
  MobileNativeChatProjectsContext,
  type MobileNativeChatProjects
} from '../project-cards/mobile-native-chat-project-context'
import { MobileNativeChatSlackContext } from './mobile-native-chat-slack-context'
import { MobileNativeChatSlackDraftCard } from './MobileNativeChatSlackDraftCard'
import { MobileNativeChatSlackMessageCard } from './MobileNativeChatSlackMessageCard'

vi.mock('react-native', () => ({
  Image: 'Image',
  Modal: 'Modal',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({
  ArrowUpRight: 'ArrowUpRight',
  Check: 'Check',
  CornerDownLeft: 'CornerDownLeft',
  Pencil: 'Pencil',
  X: 'X'
}))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {} }
}))
vi.mock('../../platform/external-link', () => ({
  tryOpenExternalLink: vi.fn(async () => true),
  openExternalLink: vi.fn()
}))

// What the host's slack-mcp cache knows. Made up.
const CACHE: Record<string, string> = { UFAKE0010: 'Ada', UFAKE0011: 'Linus', CFAKE0013: 'launch' }

const DRAFT = {
  teamId: 'TFAKE0001',
  domain: 'acme',
  to: { name: 'Sam', userId: 'UFAKE0002' },
  text: 'Thanks <@UFAKE0010> <@UFAKE0011>, cc <@UFAKE0012|Mo> and <@UFAKE0002> in <#CFAKE0013>',
  actions: [{ label: 'Send', reply: 'Send the draft to Sam', style: 'primary' }]
}

let renderer: ReactTestRenderer | null = null

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

function chat(): MobileNativeChatProjects {
  return {
    resolve: () => null,
    open: vi.fn(),
    messages: [],
    send: vi.fn(async () => true),
    canSend: true
  }
}

async function render(
  node: ReactNode,
  loadNames: (request: NativeChatSlackNamesRequest) => Promise<{
    users: Record<string, string>
    channels: Record<string, string>
  }>
): Promise<ReactTestRenderer> {
  await act(async () => {
    renderer = create(
      createElement(
        MobileNativeChatProjectsContext.Provider,
        { value: chat() },
        createElement(
          MobileNativeChatSlackContext.Provider,
          { value: { loadImage: async () => null, loadNames } },
          createElement(MobileNativeChatMessageIdContext.Provider, { value: 'm1' }, node)
        )
      )
    )
  })
  return renderer!
}

function chipLabels(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll((node) => node.props.accessibilityRole === 'link' && node.props.accessibilityLabel)
    .map((node) => String(node.props.accessibilityLabel))
}

function fromCache(request: NativeChatSlackNamesRequest) {
  const pick = (ids: string[]) =>
    Object.fromEntries(ids.flatMap((id) => (CACHE[id] ? [[id, CACHE[id]]] : [])))
  return Promise.resolve({ users: pick(request.userIds), channels: pick(request.channelIds) })
}

describe('Slack card mention names (mobile)', () => {
  it('names bare mentions in a draft from the host, keeping labels and the card’s own names', async () => {
    const loadNames = vi.fn(fromCache)
    const tree = await render(
      createElement(MobileNativeChatSlackDraftCard, {
        source: JSON.stringify(DRAFT),
        fallback: 'RAW'
      }),
      loadNames
    )
    const labels = chipLabels(tree).join('|')
    for (const name of ['@Ada', '@Linus', '@Mo', '@Sam', '#launch']) {
      expect(labels).toContain(name)
    }
    expect(labels).not.toContain('UFAKE00')
    expect(loadNames).toHaveBeenCalledWith({
      userIds: ['UFAKE0010', 'UFAKE0011'],
      channelIds: ['CFAKE0013']
    })
  })

  it('names mentions in a message card too, and shows ids when the host has none', async () => {
    const tree = await render(
      createElement(MobileNativeChatSlackMessageCard, {
        source: JSON.stringify({
          teamId: 'TFAKE0001',
          from: { name: 'Sam', userId: 'UFAKE0002' },
          channel: { id: 'CFAKE0003' },
          ts: '1700000000.000100',
          summary: 'Asks two people',
          text: 'Ask <@UFAKE0010> or <@UFAKE0098>'
        }),
        fallback: 'RAW'
      }),
      fromCache
    )
    const labels = chipLabels(tree).join('|')
    expect(labels).toContain('@Ada')
    expect(labels).toContain('@UFAKE0098')
  })
})
