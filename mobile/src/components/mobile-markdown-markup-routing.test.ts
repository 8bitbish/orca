import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileMarkdown } from './MobileMarkdown'

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
    .findAll((node) => node.type === 'MobileMarkupPreview')
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
})
