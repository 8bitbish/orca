import { describe, expect, it } from 'vitest'
import {
  nativeChatFenceRoute,
  nativeChatFences,
  nativeChatOpenFenceBody,
  type NativeChatFencePreviewScope
} from './native-chat-fence-preview'

const REPLY: NativeChatFencePreviewScope = { markupPreviews: true, openFenceBody: null }

describe('nativeChatOpenFenceBody', () => {
  it('is null when every fence closed', () => {
    expect(nativeChatOpenFenceBody('Plain prose.')).toBeNull()
    expect(nativeChatOpenFenceBody('```html\n<p>hi</p>\n```\nAfter.')).toBeNull()
    expect(nativeChatOpenFenceBody('~~~svg\n<svg/>\n~~~')).toBeNull()
  })

  it('returns the body of a trailing fence still being written', () => {
    expect(nativeChatOpenFenceBody('Here:\n```html\n<div>\n  <p>ha')).toBe('<div>\n  <p>ha')
    expect(nativeChatOpenFenceBody('```mermaid')).toBe('')
  })

  it('closes only on a matching marker at least as long, with no info string', () => {
    expect(nativeChatOpenFenceBody('````html\n```\n<p/>')).toBe('```\n<p/>')
    expect(nativeChatOpenFenceBody('```html\n~~~\n<p/>')).toBe('~~~\n<p/>')
    expect(nativeChatOpenFenceBody('```html\n```js\n<p/>')).toBe('```js\n<p/>')
    expect(nativeChatOpenFenceBody('```html\n<p/>\n  ```')).toBeNull()
  })
})

describe('nativeChatFenceRoute', () => {
  it.each([
    ['mermaid', 'mermaid'],
    ['Mermaid', 'mermaid'],
    ['html', 'html'],
    ['HTML', 'html'],
    ['svg', 'svg'],
    ['widget', 'widget'],
    ['Widget', 'widget'],
    ['project-card', 'project-card'],
    ['Project-Card', 'project-card'],
    ['ts', 'code'],
    ['xml', 'code'],
    [undefined, 'code']
  ] as const)('routes a finished %s fence in a reply to %s', (language, route) => {
    expect(nativeChatFenceRoute({ language, code: 'x\n', scope: REPLY })).toBe(route)
  })

  it('keeps html and svg as code outside a reply, but still draws mermaid', () => {
    const scope = { markupPreviews: false, openFenceBody: null }
    expect(nativeChatFenceRoute({ language: 'html', code: '<p/>', scope })).toBe('code')
    expect(nativeChatFenceRoute({ language: 'svg', code: '<svg/>', scope })).toBe('code')
    expect(nativeChatFenceRoute({ language: 'widget', code: '<div/>', scope })).toBe('code')
    expect(nativeChatFenceRoute({ language: 'mermaid', code: 'graph TD', scope })).toBe('mermaid')
  })

  it('holds back the fence that is still streaming, and only that one', () => {
    const scope = { markupPreviews: true, openFenceBody: '<div>\n  <p>ha' }
    expect(nativeChatFenceRoute({ language: 'html', code: '<div>\n  <p>ha\n', scope })).toBe('code')
    expect(nativeChatFenceRoute({ language: 'html', code: '<p>done</p>\n', scope })).toBe('html')
    const mermaid = { markupPreviews: true, openFenceBody: 'graph TD\n  A-->' }
    expect(
      nativeChatFenceRoute({ language: 'mermaid', code: 'graph TD\n  A-->', scope: mermaid })
    ).toBe('code')
  })
})

describe('nativeChatFenceRoute: project cards', () => {
  const card = '{"worktree":"orca/main"}\n'

  it('draws a finished project-card fence only in an assistant reply', () => {
    expect(nativeChatFenceRoute({ language: 'project-card', code: card, scope: REPLY })).toBe(
      'project-card'
    )
    const userOrToolOutput = { markupPreviews: false, openFenceBody: null }
    expect(
      nativeChatFenceRoute({ language: 'project-card', code: card, scope: userOrToolOutput })
    ).toBe('code')
  })

  it('keeps a project-card fence as code while it streams', () => {
    const scope = { markupPreviews: true, openFenceBody: '{"worktree":"orca/ma' }
    expect(
      nativeChatFenceRoute({ language: 'project-card', code: '{"worktree":"orca/ma\n', scope })
    ).toBe('code')
  })

  it('does not treat a widget fence as a project card: the info string after the first word is dropped', () => {
    expect(nativeChatFenceRoute({ language: 'widget', code: card, scope: REPLY })).toBe('widget')
  })
})

describe('shell Run routing', () => {
  const RUNS: NativeChatFencePreviewScope = { ...REPLY, shellRuns: true }

  it('routes a closed shell fence to the Run block only where runs are on', () => {
    expect(nativeChatFenceRoute({ language: 'bash', code: 'ls\n', scope: RUNS })).toBe('shell-run')
    expect(nativeChatFenceRoute({ language: 'bash', code: 'ls\n', scope: REPLY })).toBe('code')
    expect(nativeChatFenceRoute({ language: 'ts', code: 'ls\n', scope: RUNS })).toBe('code')
  })

  it('holds back a shell fence that is still streaming', () => {
    const scope = { ...RUNS, openFenceBody: 'ls -l' }
    expect(nativeChatFenceRoute({ language: 'bash', code: 'ls -l\n', scope })).toBe('code')
  })
})

describe('nativeChatFences', () => {
  it('lists closed fence bodies in order, apart from a trailing open one', () => {
    expect(nativeChatFences('a\n```bash\nls\n```\nb\n~~~sh\npwd\n~~~\n```bash\nmid')).toEqual({
      closed: ['ls\n', 'pwd\n'],
      open: 'mid'
    })
  })
})
