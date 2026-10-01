import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileDiagramHeader } from './MobileDiagramHeader'

const writeText = vi.fn(async (_value: string) => {})

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({ Check: 'Check', Code2: 'Code2', Copy: 'Copy' }))
vi.mock('../platform/clipboard', () => ({ useClipboardWriter: () => ({ writeText }) }))

let renderer: ReactTestRenderer | null = null

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  writeText.mockReset()
})

function render(onToggleSource = vi.fn()): ReactTestRenderer {
  act(() => {
    renderer = create(
      createElement(MobileDiagramHeader, {
        label: 'mermaid',
        source: 'graph LR; A-->B',
        showSource: false,
        onToggleSource
      })
    )
  })
  return renderer!
}

function labels(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => String(node.props.children))
}

describe('MobileDiagramHeader', () => {
  it('toggles to the source', () => {
    const onToggleSource = vi.fn()
    const tree = render(onToggleSource)
    act(() => tree.root.findByProps({ accessibilityLabel: 'Show mermaid code' }).props.onPress())
    expect(onToggleSource).toHaveBeenCalledTimes(1)
  })

  it('copies the source and says so', async () => {
    const tree = render()
    await act(async () =>
      tree.root.findByProps({ accessibilityLabel: 'Copy code' }).props.onPress()
    )
    expect(writeText).toHaveBeenCalledWith('graph LR; A-->B')
    expect(labels(tree)).toContain('Copied')
  })

  it('reports a refused copy instead of claiming it', async () => {
    writeText.mockRejectedValueOnce(new Error('refused'))
    const tree = render()
    await act(async () =>
      tree.root.findByProps({ accessibilityLabel: 'Copy code' }).props.onPress()
    )
    expect(labels(tree)).toContain('Copy failed')
  })
})
