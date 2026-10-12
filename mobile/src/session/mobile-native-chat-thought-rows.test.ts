import { createElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { mobileNativeChatThoughtRows } from './mobile-native-chat-thought-rows'

vi.mock('react-native', async () => {
  const React = await import('react')
  const node =
    (name: string) =>
    ({ children, ...props }: { children?: unknown }): unknown =>
      React.createElement(name, props, children)
  return {
    ActivityIndicator: 'ActivityIndicator',
    Animated: { Text: node('Text'), Value: class {}, loop: (a: unknown) => a },
    Image: 'Image',
    Platform: { OS: 'ios' },
    Pressable: 'Pressable',
    ScrollView: node('ScrollView'),
    Text: node('Text'),
    View: node('View'),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 }
  }
})
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('lucide-react-native', () => ({
  ArrowUp: 'ArrowUp',
  Brain: 'Brain',
  ChevronDown: 'ChevronDown',
  ChevronRight: 'ChevronRight',
  Copy: 'Copy',
  SquareChevronRight: 'SquareChevronRight',
  SquareTerminal: 'SquareTerminal',
  Wrench: 'Wrench'
}))
vi.mock('../components/MobileMarkdown', () => ({ MobileMarkdown: 'MobileMarkdown' }))
vi.mock('./MobileNativeChatMessageActionsSheet', () => ({
  MobileNativeChatMessageActionsSheet: 'MessageActionsSheet'
}))

import { MobileNativeChatMessage } from './MobileNativeChatMessage'

// Claude Code 2.1.x journals a thinking block with empty text; the transcript gives no state.
const thought = (id: string, timestamp: number, text = ''): NativeChatMessage => ({
  id,
  role: 'reasoning',
  blocks: [{ type: 'text', text }],
  timestamp,
  source: 'transcript'
})
const user = (id: string, timestamp: number): NativeChatMessage => ({
  id,
  role: 'user',
  blocks: [{ type: 'text', text: 'go' }],
  timestamp,
  source: 'transcript'
})

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

function textOf(message: NativeChatMessage, activeTurnIsWorking?: boolean): string[] {
  act(() => {
    renderer = create(createElement(MobileNativeChatMessage, { message, activeTurnIsWorking }))
  })
  return renderer!.root
    .findAllByType('Text' as never)
    .map((text: ReactTestInstance) => String(text.children.join('')))
}

describe('mobile thought rows', () => {
  it('times a transcript reasoning row from its transcript duration, with text or without', () => {
    const [, withText] = mobileNativeChatThoughtRows(
      [user('u', 0), thought('t', 1_000, 'Weighing it')],
      new Map([['t', 3]]),
      false
    )
    expect(withText).toMatchObject({ state: 'completed', completedAt: 4_000 })
    expect(textOf(withText!)).toContain('Thought for 3s')
  })

  it('leaves a row the journal already timed as it is', () => {
    const timed = { ...thought('t', 1_000), state: 'completed' as const, completedAt: 2_000 }
    const rows = [user('u', 0), timed]
    expect(mobileNativeChatThoughtRows(rows, new Map([['t', 9]]), false)).toBe(rows)
  })

  it('draws an empty thought as one plain line: timed, untimed, and live', () => {
    const [, timed] = mobileNativeChatThoughtRows(
      [user('u', 0), thought('t', 2_000)],
      new Map([['t', 2]]),
      false
    )
    expect(textOf(timed!)).toEqual(['Thought for 2s'])
    // Nothing to open: no button.
    expect(renderer!.root.findAll((node) => String(node.type) === 'Pressable')).toHaveLength(0)

    expect(textOf(thought('t', 2_000))).toEqual(['Thought'])

    const [, live] = mobileNativeChatThoughtRows(
      [user('u', 0), thought('t', 2_000)],
      new Map(),
      true
    )
    expect(textOf(live!, true)).toEqual(['Thinking…'])
  })

  it('merges back-to-back empty thoughts into one line, first start to last end', () => {
    const rows = mobileNativeChatThoughtRows(
      [user('u', 0), thought('a', 2_000), thought('b', 5_000), thought('c', 7_000, 'Real text')],
      new Map([['a', 2]]),
      false
    )
    expect(rows.map((row) => row.id)).toEqual(['u', 'a', 'c'])
    // As desktop: the first's 2 s, plus the 3 s until the last was written.
    expect(textOf(rows[1]!)).toEqual(['Thought for 5s'])
  })

  it('keeps empty thoughts from different agents apart', () => {
    const rows = mobileNativeChatThoughtRows(
      [thought('a', 1_000), { ...thought('b', 2_000), agentId: 'sub-1' }],
      new Map(),
      false
    )
    expect(rows).toHaveLength(2)
  })
})
