import { createElement } from 'react'
import { Text, TextInput } from 'react-native'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  TerminalMessageQueueSnapshot,
  TerminalQueuedMessage
} from '../../../src/shared/terminal-message-queue-contract'
import {
  MobileNativeChatQueuedMessages,
  type MobileNativeChatQueueStackProps
} from './MobileNativeChatQueuedMessages'

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View'
}))

vi.mock('lucide-react-native', () => ({
  ListOrdered: 'ListOrdered',
  Pencil: 'Pencil',
  RotateCcw: 'RotateCcw',
  X: 'X'
}))

function item(id: string, text: string, extra: Partial<TerminalQueuedMessage> = {}) {
  return { id, text, queuedAt: 1, state: 'queued' as const, ...extra }
}

function snap(items: TerminalQueuedMessage[]): TerminalMessageQueueSnapshot {
  return { revision: 1, lead: 'working', interrupting: false, terminal: 'live', items }
}

function props(overrides: Partial<MobileNativeChatQueueStackProps> = {}) {
  return {
    snapshot: snap([item('a', 'first'), item('b', 'second')]),
    orphans: [],
    lastStop: null,
    onRemove: vi.fn(),
    onSetEditing: vi.fn(),
    onSaveEdit: vi.fn(async () => true),
    onRestore: vi.fn(),
    onDiscardOrphan: vi.fn(),
    onSendNext: vi.fn(),
    ...overrides
  }
}

function textOf(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .flatMap((node) => node.props.children)
    .filter((child) => typeof child === 'string' || typeof child === 'number')
    .join('|')
}

describe('MobileNativeChatQueuedMessages', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  function mount(input: MobileNativeChatQueueStackProps): ReactTestRenderer {
    act(() => {
      renderer = create(createElement(MobileNativeChatQueuedMessages, input))
    })
    return renderer!
  }

  it('lists queued messages with a count and what they wait for', () => {
    const view = mount(props())
    const text = textOf(view)
    expect(text).toContain('Queued · 2')
    expect(text).toContain('Sends when the agent finishes')
    expect(text).toContain('first')
    expect(text).toContain('second')
  })

  it('renders nothing with no items', () => {
    const view = mount(props({ snapshot: snap([]) }))
    expect(view.toJSON()).toBeNull()
  })

  it('removes an item', () => {
    const input = props()
    const view = mount(input)
    const remove = view.root.findAllByProps({ accessibilityLabel: 'Remove from queue' })[0]!
    act(() => remove.props.onPress())
    expect(input.onRemove).toHaveBeenCalledWith('a')
  })

  it('edits inline: holds the item, saves the text, and releases on cancel', () => {
    const input = props()
    const view = mount(input)
    const edit = view.root.findAllByProps({ accessibilityLabel: 'Edit queued message' })[0]!
    act(() => edit.props.onPress())
    expect(input.onSetEditing).toHaveBeenCalledWith('a', true)
    const field = view.root.findByType(TextInput)
    act(() => field.props.onChangeText('first, rewritten'))
    const save = view.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => hasLabel(node, 'Save'))!
    act(() => save.props.onPress())
    expect(input.onSaveEdit).toHaveBeenCalledWith('a', 'first, rewritten')

    act(() =>
      view.root.findAllByProps({ accessibilityLabel: 'Edit queued message' })[0]!.props.onPress()
    )
    const cancel = view.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => hasLabel(node, 'Cancel'))!
    act(() => cancel.props.onPress())
    expect(input.onSetEditing).toHaveBeenLastCalledWith('a', false)
  })

  it('shows an item being sent without edit or remove', () => {
    const view = mount(props({ snapshot: snap([item('a', 'first', { state: 'delivering' })]) }))
    expect(textOf(view)).toContain('Sending…')
    const edit = view.root.findAllByProps({ accessibilityLabel: 'Edit queued message' })[0]!
    const remove = view.root.findAllByProps({ accessibilityLabel: 'Remove from queue' })[0]!
    expect(edit.props.disabled).toBe(true)
    expect(remove.props.disabled).toBe(true)
  })

  it('offers lost items back to the composer', () => {
    const input = props({
      snapshot: snap([]),
      orphans: [{ id: 'z', text: 'lost', reason: 'lost', queuedAt: 1, detectedAt: 1 }]
    })
    const view = mount(input)
    expect(textOf(view)).toContain('Not sent — the queue was lost')
    expect(textOf(view)).toContain('Queued · 0')
    act(() =>
      view.root.findAllByProps({ accessibilityLabel: 'Restore to composer' })[0]!.props.onPress()
    )
    expect(input.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'z' }), true)
    act(() =>
      view.root.findAllByProps({ accessibilityLabel: 'Discard message' })[0]!.props.onPress()
    )
    expect(input.onDiscardOrphan).toHaveBeenCalledWith('z')
  })

  it('offers "Send next now" after an unconfirmed Stop', () => {
    const input = props({ lastStop: 'unverifiable' })
    const view = mount(input)
    expect(textOf(view)).toContain("Couldn't confirm the agent stopped")
    const sendNext = view.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) => hasLabel(node, 'Send next now'))!
    act(() => sendNext.props.onPress())
    expect(input.onSendNext).toHaveBeenCalledTimes(1)
  })

  it('hides "Send next now" when nothing waits', () => {
    const view = mount(
      props({
        lastStop: 'unverifiable',
        snapshot: snap([]),
        orphans: [{ id: 'z', text: 'lost', reason: 'lost', queuedAt: 1, detectedAt: 1 }]
      })
    )
    expect(textOf(view)).not.toContain('Send next now')
  })
})

function hasLabel(node: ReactTestInstance, label: string) {
  return node.findAllByType(Text).some((text) => text.props.children === label)
}
