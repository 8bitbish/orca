import { describe, expect, it } from 'vitest'
import { readLinkPreviewHtmlMeta } from './link-preview-html'

const PAGE = 'https://example.com/posts/1'

describe('readLinkPreviewHtmlMeta', () => {
  it('prefers Open Graph, then Twitter, then <title> and meta description', () => {
    const html = `<html><head>
      <title>Plain &amp; title</title>
      <meta name="twitter:title" content="Twitter title">
      <meta content="OG &quot;title&quot;" property="og:title" />
      <meta name='description' content='Meta description'>
      <meta property="og:site_name" content="Example">
      <meta name="twitter:image" content="/img/card.png">
    </head><body><meta property="og:description" content="in the body"></body></html>`
    expect(readLinkPreviewHtmlMeta(html, PAGE)).toEqual({
      title: 'OG "title"',
      description: 'Meta description',
      site: 'Example',
      image: 'https://example.com/img/card.png',
      icons: ['https://example.com/favicon.ico']
    })
    expect(readLinkPreviewHtmlMeta('<title>Only &#8217;this&#x2019;</title>', PAGE).title).toBe(
      'Only ’this’'
    )
  })

  it('orders icons sharp-first and skips mask icons and data: hrefs', () => {
    const html = `<head>
      <link rel="shortcut icon" href="/favicon.ico">
      <link rel="mask-icon" href="/mask.svg">
      <link rel="apple-touch-icon" href="/touch.png">
      <link rel="icon" href="data:image/png;base64,AAAA">
      <link rel="icon" type="image/png" sizes="32x32" href="https://cdn.example.com/i32.png">
    </head>`
    expect(readLinkPreviewHtmlMeta(html, PAGE).icons).toEqual([
      'https://cdn.example.com/i32.png',
      'https://example.com/touch.png',
      'https://example.com/favicon.ico'
    ])
  })
})
