import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../src/shared/native-chat-types'
import type { NativeChatSlackImageResult } from '../../../../src/shared/native-chat-slack-image-contract'
import {
  MobileNativeChatMessageIdContext,
  MobileNativeChatProjectsContext,
  type MobileNativeChatProjects
} from '../project-cards/mobile-native-chat-project-context'
import { MOBILE_NATIVE_CHAT_MARKDOWN_RENDERERS } from '../project-cards/mobile-native-chat-markdown-renderers'
import {
  MobileNativeChatSlackContext,
  type MobileNativeChatSlack
} from './mobile-native-chat-slack-context'

const links = vi.hoisted(() => ({
  tryOpen: vi.fn(async (_url: string) => true),
  open: vi.fn((_url: string) => undefined)
}))

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
// The fence renderers also route ```proof-card, whose recordings import the native video module.
vi.mock('expo-video', () => ({ VideoView: 'VideoView', useVideoPlayer: () => null }))
vi.mock('../../components/AgentStateDot', () => ({ AgentStateDot: 'AgentStateDot' }))
vi.mock('../../components/MobileRepoIcon', () => ({ MobileRepoIcon: 'MobileRepoIcon' }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {} }
}))
vi.mock('../../platform/external-link', () => ({
  tryOpenExternalLink: links.tryOpen,
  openExternalLink: links.open
}))

// Made-up ids and text only.
const TEAM = 'TFAKE0001'
const MESSAGE = {
  status: 'needs-you',
  teamId: TEAM,
  domain: 'acme',
  from: { name: 'Sam', userId: 'UFAKE0002' },
  channel: { name: 'design-review', id: 'CFAKE0003', kind: 'channel' },
  ts: '1700000000.000100',
  sentAt: '2026-10-01T16:47:00+03:00',
  summary: 'Wants a call on the sidebar: overlay or push?',
  text: 'Which do you prefer, *overlay* or _push_? <@UFAKE0004|Lee> agrees. '.repeat(4),
  images: [{ path: 'FFAKE0005/mock.png', name: 'mock.png', width: 1200, height: 800 }],
  thread: { replies: 3, youReplied: false },
  actions: [
    { label: 'Overlay', reply: 'Draft a reply to Sam going with overlay', style: 'primary' },
    { label: 'Reply…', input: true }
  ]
}
const DRAFT = {
  teamId: TEAM,
  domain: 'acme',
  to: { name: 'Sam', userId: 'UFAKE0002' },
  channel: { name: 'design-review', id: 'CFAKE0003' },
  threadTs: '1700000000.000100',
  text: 'Going with *overlay*, thanks!',
  actions: [
    { label: 'Send', reply: 'Send the draft to Sam', style: 'primary' },
    { label: 'Cancel', reply: 'Cancel the draft to Sam' }
  ]
}
const IMAGE: NativeChatSlackImageResult = {
  src: 'data:image/png;base64,iVBORw0KGgo=',
  mimeType: 'image/png',
  width: 1024,
  height: 683,
  byteLength: 8
}

function message(id: string, role: 'user' | 'assistant', text: string): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text }], timestamp: 0, source: 'hook' }
}

function chat(overrides: Partial<MobileNativeChatProjects> = {}): MobileNativeChatProjects {
  return {
    resolve: () => null,
    open: vi.fn(),
    messages: [message('m1', 'assistant', 'card')],
    send: vi.fn(async () => true),
    canSend: true,
    ...overrides
  }
}

let renderer: ReactTestRenderer | null = null

beforeEach(() => {
  links.tryOpen.mockReset()
  links.tryOpen.mockImplementation(async () => true)
  links.open.mockReset()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function render(
  node: ReactNode,
  value: MobileNativeChatProjects = chat(),
  slack: MobileNativeChatSlack = { loadImage: async () => IMAGE }
): Promise<ReactTestRenderer> {
  await act(async () => {
    renderer = create(
      createElement(
        MobileNativeChatProjectsContext.Provider,
        { value },
        createElement(
          MobileNativeChatSlackContext.Provider,
          { value: slack },
          createElement(MobileNativeChatMessageIdContext.Provider, { value: 'm1' }, node)
        )
      )
    )
  })
  return renderer!
}

function fence(language: string, body: unknown): ReactNode {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return MOBILE_NATIVE_CHAT_MARKDOWN_RENDERERS.renderFence!({ language, text }, 'RAW', 'k')
}

function chip(href: string, label: string): ReactNode {
  return MOBILE_NATIVE_CHAT_MARKDOWN_RENDERERS.renderLink!(href, label, 'k')
}

function texts(tree: ReactTestRenderer): string {
  return tree.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) =>
      [node.props.children]
        .flat()
        .filter((child) => typeof child === 'string' || typeof child === 'number')
        .join('')
    )
    .join('|')
}

function linkNodes(tree: ReactTestRenderer) {
  return tree.root.findAll(
    // Chips are pressable pills; mrkdwn links are pressable text.
    (node) =>
      (String(node.type) === 'Text' || String(node.type) === 'Pressable') &&
      node.props.accessibilityRole === 'link'
  )
}

describe('Slack chips', () => {
  it.each([
    ['slack-user:TFAKE0001/UFAKE0002?d=acme', 'Sam', 'slack://user?team=TFAKE0001&id=UFAKE0002'],
    [
      'slack-channel:TFAKE0001/CFAKE0003?d=acme',
      '#design',
      'slack://channel?team=TFAKE0001&id=CFAKE0003'
    ],
    [
      'slack-message:TFAKE0001/CFAKE0003/1700000000.000100?d=acme',
      'Sam · sidebar ↗',
      'https://acme.slack.com/archives/CFAKE0003/p1700000000000100'
    ]
  ])('%s opens its primary link', async (href, label, primary) => {
    const tree = await render(chip(href, label))
    const [pill] = linkNodes(tree)
    expect(pill!.props.accessibilityLabel).toContain(label)
    await act(async () => pill!.props.onPress())
    expect(links.tryOpen.mock.calls).toEqual([[primary]])
  })

  it('falls back to the secondary link when the primary does not open', async () => {
    links.tryOpen.mockImplementation(async (url: string) => !url.startsWith('slack://'))
    const tree = await render(chip('slack-channel:TFAKE0001/CFAKE0003?d=acme', '#design'))
    await act(async () => linkNodes(tree)[0]!.props.onPress())
    expect(links.tryOpen.mock.calls).toEqual([
      ['slack://channel?team=TFAKE0001&id=CFAKE0003'],
      ['https://acme.slack.com/archives/CFAKE0003']
    ])
  })

  it('adds ↗ to a message link that lacks one', async () => {
    const tree = await render(chip('slack-message:TFAKE0001/CFAKE0003/1700000000.000100', 'thread'))
    expect(texts(tree)).toContain('thread ↗')
  })

  it.each([
    'slack-user:tfake0001/UFAKE0002',
    'slack-user:TFAKE0001/UFAKE0002/extra',
    'slack-channel:TFAKE0001/CFAKE0003?x=1',
    'slack-message:TFAKE0001/CFAKE0003/17000'
  ])('renders %s as its plain text', async (href) => {
    const tree = await render(chip(href, 'Plain label'))
    expect(linkNodes(tree)).toEqual([])
    expect(texts(tree)).toBe('Plain label')
  })
})

describe('slack-message card', () => {
  it('shows the header, summary, clamped text, thread line and Open in Slack', async () => {
    const tree = await render(fence('slack-message', MESSAGE))
    const all = texts(tree)
    expect(all).toContain('Needs you')
    expect(all).toContain('Sam')
    expect(all).toContain('#design-review')
    expect(all).toContain(MESSAGE.summary)
    expect(all).toContain('🧵 3 replies · you haven’t replied')
    expect(all).toContain('Sends “Draft a reply to Sam going with overlay”')
    expect(linkNodes(tree).some((node) => node.props.accessibilityLabel.includes('@Lee'))).toBe(
      true
    )
    const clamped = () =>
      tree.root.findAll((node) => String(node.type) === 'Text' && node.props.numberOfLines === 3)
    // Two action captions plus the message body.
    expect(clamped()).toHaveLength(3)
    await act(async () =>
      tree.root.findByProps({ accessibilityLabel: 'Show the whole message' }).props.onPress()
    )
    expect(texts(tree)).toContain('less ▴')
    expect(clamped()).toHaveLength(2)
    await act(async () =>
      tree.root.findByProps({ accessibilityLabel: 'Open in Slack' }).props.onPress()
    )
    expect(links.tryOpen.mock.calls).toEqual([
      ['https://acme.slack.com/archives/CFAKE0003/p1700000000000100']
    ])
  })

  it('draws Slack emoji codes in the summary and text, leaving code and custom codes', async () => {
    const tree = await render(
      fence('slack-message', {
        ...MESSAGE,
        summary: 'Happy with it :slightly_smiling_face: :+1::skin-tone-2:',
        text: 'Ha :joy: :ok_hand::skin-tone-3: *nice :tada:* `:joy:` :partyparrot:'
      })
    )
    const all = texts(tree).split('|')
    expect(all).toContain('Happy with it 🙂 👍🏻')
    expect(all).toContain('Ha 😂 👌🏼   :partyparrot:')
    expect(all).toContain('nice 🎉')
    expect(all).toContain(':joy:')
  })

  it('sends an action’s exact text as the user’s message and keeps it chosen', async () => {
    const value = chat()
    const tree = await render(fence('slack-message', MESSAGE), value)
    const [overlay] = tree.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && node.props.accessibilityState
    )
    await act(async () => overlay!.props.onPress())
    expect(value.send).toHaveBeenCalledWith('Draft a reply to Sam going with overlay')
    expect(texts(tree)).toContain('Sent “Draft a reply to Sam going with overlay”')
  })

  it('reads the choice back from a later user message', async () => {
    const tree = await render(
      fence('slack-message', MESSAGE),
      chat({
        messages: [
          message('m1', 'assistant', 'card'),
          message('m2', 'user', 'Draft a reply to Sam going with overlay')
        ]
      })
    )
    expect(texts(tree)).toContain('Sent “Draft a reply to Sam going with overlay”')
  })

  it('shows the host’s thumbnail and opens it full size', async () => {
    const loadImage = vi.fn(async () => IMAGE)
    const tree = await render(fence('slack-message', MESSAGE), chat(), { loadImage })
    expect(loadImage).toHaveBeenCalledWith('FFAKE0005/mock.png', 'thumbnail')
    const thumb = tree.root.findByProps({ accessibilityLabel: 'mock.png, show full size' })
    await act(async () => thumb.props.onPress())
    expect(loadImage).toHaveBeenCalledWith('FFAKE0005/mock.png', 'full')
    expect(tree.root.findAll((node) => String(node.type) === 'Modal')).toHaveLength(1)
  })

  it('leaves an image out when the host gives none', async () => {
    const tree = await render(fence('slack-message', MESSAGE), chat(), {
      loadImage: async () => null
    })
    expect(tree.root.findAll((node) => String(node.type) === 'Image')).toEqual([])
    expect(texts(tree)).toContain(MESSAGE.summary)
  })

  it.each([
    ['bad JSON', '{"teamId": '],
    ['an unknown key', { ...MESSAGE, extra: true }],
    ['a bad id', { ...MESSAGE, teamId: 'acme' }],
    ['a numeric ts', { ...MESSAGE, ts: 1700000000.0001 }]
  ])('falls back to the raw block for %s', async (_name, body) => {
    const tree = await render(fence('slack-message', body))
    expect(tree.toJSON()).toBe('RAW')
  })
})

describe('slack-draft card', () => {
  it('shows the draft as not sent, with who it is to and its text', async () => {
    const tree = await render(fence('slack-draft', DRAFT))
    const all = texts(tree)
    expect(all).toContain('Draft, not sent')
    expect(all).toContain('To ')
    expect(all).toContain('Sam')
    expect(all).toContain('#design-review')
    expect(all).toContain('overlay')
    expect(all).toContain('Sends “Send the draft to Sam”')
  })

  it('draws Slack emoji codes in the draft text', async () => {
    const tree = await render(
      fence('slack-draft', { ...DRAFT, text: 'Thanks :wave::skin-tone-4: :heart: :custom_one:' })
    )
    expect(texts(tree).split('|')).toContain('Thanks 👋🏽 ❤️ :custom_one:')
  })

  it('only ever replies into the chat: nothing goes to Slack or the network', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const loadImage = vi.fn(async () => null)
    const send = vi.fn(async (_text: string) => true)
    const tree = await render(fence('slack-draft', DRAFT), chat({ send }), { loadImage })
    const [sendButton] = tree.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && node.props.accessibilityState
    )
    await act(async () => sendButton!.props.onPress())
    expect(send.mock.calls).toEqual([['Send the draft to Sam']])
    expect(links.tryOpen).not.toHaveBeenCalled()
    expect(links.open).not.toHaveBeenCalled()
    expect(loadImage).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Open in Slack')).toEqual(
      []
    )
    vi.unstubAllGlobals()
  })

  it.each([
    ['bad JSON', 'not json'],
    ['no recipient', { teamId: TEAM, text: 'hi' }],
    ['an unknown key', { ...DRAFT, send: true }]
  ])('falls back to the raw block for %s', async (_name, body) => {
    const tree = await render(fence('slack-draft', body))
    expect(tree.toJSON()).toBe('RAW')
  })
})
