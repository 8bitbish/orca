import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MobileNativeChatThoughtRow,
  mobileNativeChatThoughtLabel
} from './MobileNativeChatThoughtRow'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({ ChevronRight: 'ChevronRight' }))
vi.mock('../components/MobileMarkdown', () => ({ MobileMarkdown: 'MobileMarkdown' }))

let renderer: ReactTestRenderer | null = null

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

function render(markdown: string, open: boolean, onToggle = vi.fn()): ReactTestRenderer {
  act(() => {
    renderer = create(
      createElement(MobileNativeChatThoughtRow, {
        markdown,
        thought: { seconds: 6, live: false, open, onToggle },
        fontScale: 1
      })
    )
  })
  return renderer!
}

describe('MobileNativeChatThoughtRow', () => {
  it('words the fold as desktop does', () => {
    expect(mobileNativeChatThoughtLabel(true, 6)).toBe('Thinking…')
    expect(mobileNativeChatThoughtLabel(false, null)).toBe('Thought')
    expect(mobileNativeChatThoughtLabel(false, 6)).toBe('Thought for 6s')
  })

  it('folds reasoning to one line that opens to the text', () => {
    const onToggle = vi.fn()
    const folded = render('Weighing the options', false, onToggle)
    expect(folded.root.findAll((node) => String(node.type) === 'MobileMarkdown')).toHaveLength(0)
    act(() => folded.root.findByProps({ accessibilityRole: 'button' }).props.onPress())
    expect(onToggle).toHaveBeenCalledTimes(1)
    const open = render('Weighing the options', true)
    expect(open.root.findByProps({ content: 'Weighing the options' })).toBeTruthy()
  })

  it('draws a thought with no text as a plain line with nothing to open', () => {
    const tree = render('', false)
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0)
    expect(tree.root.findAll((node) => String(node.type) === 'Text')[0]?.props.children).toBe(
      'Thought for 6s'
    )
  })
})
