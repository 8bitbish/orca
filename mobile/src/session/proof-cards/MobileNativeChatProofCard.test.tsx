import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../src/shared/native-chat-types'
import {
  MobileNativeChatMessageIdContext,
  MobileNativeChatProjectsContext,
  type MobileNativeChatProjects
} from '../project-cards/mobile-native-chat-project-context'
import { MOBILE_NATIVE_CHAT_MARKDOWN_RENDERERS } from '../project-cards/mobile-native-chat-markdown-renderers'
import {
  MobileNativeChatProofMediaContext,
  type MobileNativeChatProofMediaSource
} from './mobile-native-chat-proof-context'
import type {
  MobileNativeChatProofFile,
  MobileNativeChatProofMediaLoader
} from './mobile-native-chat-proof-media-loader'

const links = vi.hoisted(() => ({
  tryOpen: vi.fn(async (_url: string) => true),
  open: vi.fn((_url: string) => undefined)
}))
const video = vi.hoisted(() => {
  const players: Record<string, unknown>[] = []
  return { players }
})

vi.mock('react-native', () => {
  const animated = {
    Value: class {
      constructor(public value: number) {}
    },
    timing: () => ({}),
    sequence: () => ({}),
    loop: () => ({ start: () => {}, stop: () => {} }),
    View: 'AnimatedView'
  }
  return {
    Animated: animated,
    Image: 'Image',
    Modal: 'Modal',
    PanResponder: { create: () => ({ panHandlers: {} }) },
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: {
      create: (styles: unknown) => styles,
      hairlineWidth: 1,
      absoluteFill: {},
      absoluteFillObject: {}
    },
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View'
  }
})
vi.mock('lucide-react-native', () =>
  Object.fromEntries(
    [
      'ArrowUpRight',
      'Check',
      'ChevronsLeftRight',
      'Circle',
      'CircleCheck',
      'CircleDashed',
      'CircleX',
      'CodeXml',
      'CornerDownLeft',
      'Globe',
      'ImageOff',
      'Maximize2',
      'Monitor',
      'Pencil',
      'PenTool',
      'Smartphone',
      'VideoOff',
      'X'
    ].map((name) => [name, name])
  )
)
vi.mock('react-native-svg', () => ({
  default: 'Svg',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Rect: 'Rect',
  Stop: 'Stop'
}))
vi.mock('expo-video', () => ({
  VideoView: 'VideoView',
  useVideoPlayer: (_uri: string, setup: (player: Record<string, unknown>) => void) => {
    const player: Record<string, unknown> = {
      play: vi.fn(),
      addListener: () => ({ remove: () => {} })
    }
    setup(player)
    video.players.push(player)
    return player
  }
}))
vi.mock('../../components/AgentStateDot', () => ({
  AgentStateDot: 'AgentStateDot',
  agentStateDotColor: () => '#fff'
}))
vi.mock('../../components/MobileRepoIcon', () => ({ MobileRepoIcon: 'MobileRepoIcon' }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {} }
}))
vi.mock('../../platform/external-link', () => ({
  tryOpenExternalLink: links.tryOpen,
  openExternalLink: links.open
}))

// Made-up project, files and links only.
const CARD = {
  worktree: 'demo-app/fake-tile-switch',
  title: 'Tap another tile to switch',
  kind: 'web',
  summary: 'Tapping another tile switches to it.',
  media: [
    {
      type: 'video',
      path: '~/.orca-personal/proof/demo-app/2026-10-04-fake/flow.mp4',
      caption: 'Switching tiles'
    },
    { type: 'image', path: 'demo-app/2026-10-04-fake/before.png', role: 'before' },
    { type: 'image', path: 'demo-app/2026-10-04-fake/after.png', role: 'after' },
    { type: 'image', path: 'demo-app/2026-10-04-fake/extra.png', caption: 'Settings' }
  ],
  checks: [
    { label: 'Tests', result: '12/12 pass' },
    { label: 'On phone', result: 'not checked' }
  ],
  links: [{ label: 'PR #1', url: 'https://example.com/pr/1' }],
  actions: [
    { label: 'Looks right', reply: 'Looks right, ship it', style: 'primary' },
    { label: 'Needs changes…', input: true }
  ]
}
const IMAGE = {
  src: 'data:image/png;base64,iVBORw0KGgo=',
  mimeType: 'image/png',
  width: 1000,
  height: 500,
  byteLength: 8
} as const

function message(id: string, text: string): NativeChatMessage {
  return { id, role: 'assistant', blocks: [{ type: 'text', text }], timestamp: 0, source: 'hook' }
}

function chat(overrides: Partial<MobileNativeChatProjects> = {}): MobileNativeChatProjects {
  return {
    resolve: () => null,
    open: vi.fn(),
    messages: [message('m1', 'card')],
    send: vi.fn(async () => true),
    canSend: true,
    ...overrides
  }
}

function readyLoader(
  overrides: Partial<MobileNativeChatProofMediaLoader> = {}
): MobileNativeChatProofMediaLoader {
  return {
    loadFile: vi.fn(
      async () => ({ ok: true, uri: 'file:///cache/flow.mp4', mimeType: 'video/mp4' }) as const
    ),
    loadThumbnail: vi.fn(async () => ({ ok: true, image: IMAGE }) as const),
    ...overrides
  }
}

let renderer: ReactTestRenderer | null = null

beforeEach(() => {
  links.open.mockReset()
  video.players.length = 0
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function render(
  node: ReactNode,
  media: MobileNativeChatProofMediaSource | null = { status: 'supported', loader: readyLoader() },
  value: MobileNativeChatProjects = chat()
): Promise<ReactTestRenderer> {
  await act(async () => {
    renderer = create(
      createElement(
        MobileNativeChatProjectsContext.Provider,
        { value },
        createElement(
          MobileNativeChatProofMediaContext.Provider,
          { value: media },
          createElement(MobileNativeChatMessageIdContext.Provider, { value: 'm1' }, node)
        )
      )
    )
  })
  return renderer!
}

function fence(body: unknown, language = 'proof-card'): ReactNode {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return MOBILE_NATIVE_CHAT_MARKDOWN_RENDERERS.renderFence!({ language, text }, 'RAW', 'k')
}

function texts(root: ReactTestRenderer): string {
  return root.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => node.children.filter((child) => typeof child === 'string').join(''))
    .join('|')
}

function byLabel(root: ReactTestRenderer, label: string | RegExp): ReactTestInstance[] {
  return root.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.accessibilityLabel === 'string' &&
      (typeof label === 'string'
        ? node.props.accessibilityLabel === label
        : label.test(node.props.accessibilityLabel))
  )
}

/** Gives every laid-out view a phone card's size, twice: the card, then the slider in it. */
function layOut(root: ReactTestRenderer): void {
  const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 340, height: 360 } } }
  for (let pass = 0; pass < 2; pass += 1) {
    for (const node of root.root.findAll((n) => typeof n.props.onLayout === 'function')) {
      act(() => node.props.onLayout(layout))
    }
  }
}

describe('MobileNativeChatProofCard', () => {
  it('routes a ```proof-card fence to the card with its header, checks, links and actions', async () => {
    const root = await render(fence(CARD))
    const shown = texts(root)
    expect(shown).toContain('demo-app/fake-tile-switch')
    expect(shown).toContain('Web')
    expect(shown).toContain('Tap another tile to switch')
    expect(shown).toContain('12/12 pass')
    expect(shown).toContain('not checked')
    expect(shown).toContain('PR #1')
    expect(shown).toContain('Looks right')
    expect(shown).not.toContain('RAW')
  })

  it.each([
    ['bad JSON', '{"worktree": '],
    ['a missing title', { ...CARD, title: undefined }],
    ['an unknown kind', { ...CARD, kind: 'tv' }],
    ['a non-http link', { ...CARD, links: [{ label: 'x', url: 'javascript:alert(1)' }] }]
  ])('shows the raw block for %s', async (_name, body) => {
    const root = await render(fence(body))
    expect(root.toJSON()).toBe('RAW')
  })

  it('leaves other fences to the code block', () => {
    expect(fence(CARD, 'json')).toBeNull()
  })

  it('shows "Media unavailable" for an old host and still renders the rest', async () => {
    const root = await render(fence(CARD), { status: 'unsupported' })
    expect(byLabel(root, /^Media unavailable: /)).toHaveLength(4)
    expect(texts(root)).toContain('12/12 pass')
    expect(byLabel(root, 'Replies')).toHaveLength(1)
  })

  it('names a file outside the proof folder without asking the host', async () => {
    const loader = readyLoader()
    const root = await render(
      fence({ ...CARD, media: [{ type: 'video', path: '/tmp/elsewhere/flow.mp4' }] }),
      { status: 'supported', loader }
    )
    expect(byLabel(root, 'Not in the proof folder: flow.mp4')).toHaveLength(1)
    expect(loader.loadFile).not.toHaveBeenCalled()
  })

  it('plays the recording muted and looped from the cached file', async () => {
    const loader = readyLoader()
    const root = await render(fence(CARD), { status: 'supported', loader })
    expect(loader.loadFile).toHaveBeenCalledWith(
      'demo-app/2026-10-04-fake/flow.mp4',
      expect.anything()
    )
    const [view] = root.root.findAll((node) => String(node.type) === 'VideoView')
    expect(view.props.nativeControls).toBe(false)
    expect(video.players[0]).toMatchObject({ muted: true, loop: true })
    expect(video.players[0].play).toHaveBeenCalled()
    expect(byLabel(root, 'Play Switching tiles full screen')).toHaveLength(1)
  })

  it('shows download progress, then a placeholder for a refusal', async () => {
    let finish: (value: MobileNativeChatProofFile) => void = () => {}
    const loader = readyLoader({
      loadFile: vi.fn<MobileNativeChatProofMediaLoader['loadFile']>((_path, options) => {
        options?.onProgress?.(512 * 1024, 2 * 1024 * 1024)
        return new Promise((resolve) => {
          finish = resolve
        })
      })
    })
    const root = await render(fence({ ...CARD, media: [CARD.media[0]] }), {
      status: 'supported',
      loader
    })
    expect(byLabel(root, 'Loading, 0.5 of 2.0 MB')).toHaveLength(1)
    await act(async () => finish({ ok: false, reason: 'changed' }))
    expect(byLabel(root, 'The file changed on the Mac: flow.mp4')).toHaveLength(1)
  })

  it('aborts the download when the card unmounts', async () => {
    let signal: AbortSignal | undefined
    const loader = readyLoader({
      loadFile: vi.fn<MobileNativeChatProofMediaLoader['loadFile']>((_path, options) => {
        signal = options?.signal
        return new Promise(() => {})
      })
    })
    const root = await render(fence(CARD), { status: 'supported', loader })
    expect(signal?.aborted).toBe(false)
    act(() => root.unmount())
    renderer = null
    expect(signal?.aborted).toBe(true)
  })

  it('compares one before and one after with a slider that starts at 50% and steps by 10', async () => {
    const root = await render(fence(CARD))
    layOut(root)
    const [slider] = root.root.findAll((node) => node.props.accessibilityRole === 'adjustable')
    expect(slider.props.accessibilityValue).toMatchObject({ now: 50 })
    await act(async () =>
      slider.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } })
    )
    const [moved] = root.root.findAll((node) => node.props.accessibilityRole === 'adjustable')
    expect(moved.props.accessibilityValue).toMatchObject({ now: 60 })
    // The pair is in the slider; only the other screenshot is in the strip.
    expect(byLabel(root, /show full size$/).map((node) => node.props.accessibilityLabel)).toEqual([
      'Settings, show full size'
    ])
  })

  it('falls back to the strip when a compared image cannot load', async () => {
    const loader = readyLoader({
      loadThumbnail: vi.fn(async (path: string) =>
        path.endsWith('before.png')
          ? ({ ok: false, reason: 'missing' } as const)
          : ({ ok: true, image: IMAGE } as const)
      )
    })
    const root = await render(fence(CARD), { status: 'supported', loader })
    expect(root.root.findAll((node) => node.props.accessibilityRole === 'adjustable')).toHaveLength(
      0
    )
    expect(byLabel(root, 'Screenshot not found: before.png')).toHaveLength(1)
  })

  it('sends an action reply as the next chat message and shows it was sent', async () => {
    const value = chat()
    const root = await render(fence(CARD), undefined, value)
    const [button] = root.root.findAll(
      (node) =>
        String(node.type) === 'Pressable' && node.props.accessibilityState?.selected === false
    )
    await act(async () => button.props.onPress())
    expect(value.send).toHaveBeenCalledWith('Looks right, ship it')
    expect(texts(root)).toContain('Sent “Looks right, ship it”')
  })

  it('opens a link externally', async () => {
    const root = await render(fence(CARD))
    const [link] = byLabel(root, 'PR #1, opens https://example.com/pr/1')
    act(() => link.props.onPress())
    expect(links.open).toHaveBeenCalledWith('https://example.com/pr/1')
  })
})
