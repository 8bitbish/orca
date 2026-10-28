import { describe, expect, it } from 'vitest'
import { parseNativeChatLinkCards } from './native-chat-link-cards-payload'

const parse = (value: unknown) => parseNativeChatLinkCards(JSON.stringify(value))

describe('parseNativeChatLinkCards', () => {
  it('defaults to a list and keeps only the fields given', () => {
    expect(
      parse({ items: [{ url: 'https://example.com/a', title: '  A  page ', site: null }] })
    ).toEqual({
      layout: 'list',
      items: [{ url: 'https://example.com/a', title: 'A page' }],
      hidden: 0
    })
  })

  it('rejects the whole fence for anything off the schema', () => {
    for (const bad of [
      { items: [] },
      { layout: 'carousel', items: [{ url: 'https://example.com' }] },
      { items: [{ url: 'https://example.com', extra: 1 }] },
      { items: [{ url: 'https://example.com' }], title: 'x' },
      { items: [{ url: 'javascript:alert(1)' }] },
      { items: [{ url: 'https://user:pw@example.com' }] },
      { items: [{ url: 'https://example.com', image: 'file:///etc/passwd' }] },
      { items: [{ url: 'https://example.com', title: 3 }] }
    ]) {
      expect(parse(bad)).toBeNull()
    }
    expect(parseNativeChatLinkCards('{not json')).toBeNull()
  })

  it('cuts long text and shows at most eight items, counting the rest', () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      url: `https://example.com/${index}`,
      title: 'x'.repeat(500)
    }))
    const cards = parse({ layout: 'grid', items })
    expect(cards?.items).toHaveLength(8)
    expect(cards?.hidden).toBe(2)
    expect(cards?.items[0].title).toHaveLength(200)
    expect(cards?.items[0].title?.endsWith('…')).toBe(true)
  })
})
