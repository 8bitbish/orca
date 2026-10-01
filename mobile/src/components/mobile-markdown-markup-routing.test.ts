import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileMarkdown } from './MobileMarkdown'
import { MobileMarkdownRenderersContext } from './mobile-markdown-renderers'

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn() },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles, hairlineWidth: 1 },
  Text: 'Text',
  View: 'View'
}))
vi.mock('./pr-sidebar/MermaidDiagram', () => ({ MermaidDiagram: 'MermaidDiagram' }))
vi.mock('./markup-preview/MobileMarkupPreview', () => ({
  MobileMarkupPreview: 'MobileMarkupPreview'
}))

afterEach(() => {
  renderer?.unmount()
  renderer = undefined
})

let renderer: ReactTestRenderer | undefined

function previews(
  content: string,
  markupPreviews: boolean
): Array<{ source: string; kind: string }> {
  act(() => {
    renderer = create(createElement(MobileMarkdown, { content, markupPreviews }))
  })
  return renderer!.root
    .findAll((node) => String(node.type) === 'MobileMarkupPreview')
    .map((node) => ({ source: node.props.source, kind: node.props.kind }))
}

describe('MobileMarkdown markup preview routing', () => {
  it('draws closed html, svg and widget fences in agent replies', () => {
    const content =
      '```html\n<p>a</p>\n```\n\n```svg\n<svg/>\n```\n\n```widget\n<div class="card"></div>\n```'
    expect(previews(content, true)).toEqual([
      { source: '<p>a</p>', kind: 'html' },
      { source: '<svg/>', kind: 'svg' },
      { source: '<div class="card"></div>', kind: 'widget' }
    ])
  })

  it('keeps a streaming fence as code', () => {
    expect(previews('```widget\n<div>', true)).toEqual([])
  })

  it('keeps markup as code outside agent replies', () => {
    expect(previews('```html\n<p>a</p>\n```', false)).toEqual([])
  })

  it('hands closed fences and links to the provided renderers', () => {
    const fences: string[] = []
    const links: string[] = []
    act(() => {
      renderer = create(
        createElement(
          MobileMarkdownRenderersContext.Provider,
          {
            value: {
              renderFence: (fence) => {
                fences.push(`${fence.language}:${fence.text}`)
                return createElement('Card')
              },
              renderLink: (href) => {
                links.push(href)
                return href.startsWith('orca-worktree:')
                  ? createElement('Chip', { key: href })
                  : null
              }
            }
          },
          createElement(MobileMarkdown, {
            content:
              'See **[orca](orca-worktree:orca/cards):** and [docs](https://x.dev).\n\n```project-card\n{"worktree":"orca"}\n```\n\n```ts\nopen',
            markupPreviews: true
          })
        )
      )
    })
    expect(fences).toEqual(['project-card:{"worktree":"orca"}'])
    expect(links).toEqual(['orca-worktree:orca/cards', 'https://x.dev'])
    const types = renderer!.root.findAll(() => true).map((node) => String(node.type))
    expect(types).toContain('Card')
    expect(types).toContain('Chip')
  })

  it('turns selection off for every run when asked', () => {
    act(() => {
      renderer = create(
        createElement(MobileMarkdown, {
          content: '# Head\n\nBody **bold**\n\n```ts\ncode\n```\n\n- item',
          rangeSelectable: true,
          selectable: false
        })
      )
    })
    const selectable = renderer!.root.findAll(
      (node) => String(node.type) === 'Text' && node.props.selectable === true
    )
    expect(selectable).toHaveLength(0)
  })
})
