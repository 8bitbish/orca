import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../src/shared/native-chat-types'
import type { MobileNativeChatProject } from './mobile-native-chat-project'
import {
  MobileNativeChatMessageIdContext,
  MobileNativeChatProjectsContext,
  type MobileNativeChatProjects
} from './mobile-native-chat-project-context'
import { MobileNativeChatProjectCard } from './MobileNativeChatProjectCard'

vi.mock('react-native', () => ({
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
  Pencil: 'Pencil'
}))
vi.mock('../../components/AgentStateDot', () => ({ AgentStateDot: 'AgentStateDot' }))
vi.mock('../../components/MobileRepoIcon', () => ({ MobileRepoIcon: 'MobileRepoIcon' }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => {} }
}))

const SOURCE = JSON.stringify({
  worktree: 'orca/cards',
  note: 'Cards are ready.',
  ask: 'Ship them?',
  actions: [
    { label: 'Ship', reply: 'Ship the cards', style: 'primary' },
    { label: 'Something else', input: true }
  ]
})

const PROJECT: MobileNativeChatProject = {
  worktreeId: 'r1::/w/cards',
  name: 'orca',
  workspace: 'cards',
  repo: { id: 'r1', displayName: 'orca' },
  status: 'needs-you',
  liveLine: { text: 'May I push?', time: 'for 5m' }
}

function message(id: string, role: 'user' | 'assistant', text: string): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text }], timestamp: 0, source: 'hook' }
}

let renderer: ReactTestRenderer | null = null

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function render(projects: MobileNativeChatProjects): Promise<ReactTestRenderer> {
  await act(async () => {
    renderer = create(
      createElement(
        MobileNativeChatProjectsContext.Provider,
        { value: projects },
        createElement(
          MobileNativeChatMessageIdContext.Provider,
          { value: 'm1' },
          createElement(MobileNativeChatProjectCard, { source: SOURCE, fallback: 'RAW' })
        )
      )
    )
  })
  return renderer!
}

function projects(overrides: Partial<MobileNativeChatProjects> = {}): MobileNativeChatProjects {
  return {
    resolve: () => PROJECT,
    open: vi.fn(),
    messages: [message('m1', 'assistant', 'card')],
    send: vi.fn(async () => true),
    canSend: true,
    ...overrides
  }
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => [node.props.children].flat().join(''))
}

describe('MobileNativeChatProjectCard', () => {
  it('sends an action’s exact text once and locks every action', async () => {
    const value = projects()
    const tree = await render(value)
    expect(texts(tree)).toContain('Sends “Ship the cards”')
    const ship = tree.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && node.props.accessibilityState
    )[0]!
    await act(async () => ship.props.onPress())
    expect(value.send).toHaveBeenCalledWith('Ship the cards')
    expect(texts(tree)).toContain('Sent “Ship the cards”')
    const actions = tree.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && node.props.accessibilityState
    )
    expect(actions.every((action) => action.props.disabled)).toBe(true)
  })

  it('reads the choice back from a later user message', async () => {
    const tree = await render(
      projects({
        messages: [message('m1', 'assistant', 'card'), message('m2', 'user', 'Ship the cards')]
      })
    )
    expect(texts(tree)).toContain('Sent “Ship the cards”')
  })

  it('opens the workspace', async () => {
    const value = projects()
    const tree = await render(value)
    await act(async () =>
      tree.root.findByProps({ accessibilityLabel: 'Open orca cards' }).props.onPress()
    )
    expect(value.open).toHaveBeenCalledWith(PROJECT)
  })

  it('falls back to the raw block for a workspace the host does not list', async () => {
    const tree = await render(projects({ resolve: () => null }))
    expect(tree.toJSON()).toBe('RAW')
  })
})
