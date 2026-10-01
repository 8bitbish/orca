import { describe, expect, it } from 'vitest'
import { parseSlackMrkdwn, slackMrkdwnToMarkdown } from './native-chat-slack-mrkdwn'

// Made-up ids and text only.
const OPTIONS = { teamId: 'TFAKE0001' }

describe('slackMrkdwnToMarkdown', () => {
  it.each([
    ['bold', 'a *bold* word', 'a **bold** word'],
    ['italic', 'an _italic_ word', 'an *italic* word'],
    ['strike', 'a ~gone~ word', 'a ~~gone~~ word'],
    ['nested', '*_both_*', '***both***'],
    ['inline code', 'run `pnpm test` now', 'run `pnpm test` now'],
    ['code keeps its markers', 'see `*not bold*`', 'see `*not bold*`'],
    [
      'a code block',
      'before\n```\nconst a = 1\n```\nafter',
      'before\n\n```\nconst a = 1\n```\n\nafter'
    ],
    [
      'a labelled link',
      'see <https://example.com/a?b=1&amp;c=2|the doc>',
      'see [the doc](<https://example.com/a?b=1&c=2>)'
    ],
    ['a bare link', '<https://example.com>', '[https://example.com](<https://example.com>)'],
    ['a mailto link', '<mailto:someone@example.com|mail>', '[mail](<mailto:someone@example.com>)'],
    ['a user mention', 'ping <@UFAKE0002>', 'ping [@UFAKE0002](slack-user:TFAKE0001/UFAKE0002)'],
    ['a labelled user mention', '<@UFAKE0002|sam>', '[@sam](slack-user:TFAKE0001/UFAKE0002)'],
    [
      'a channel mention',
      'in <#CFAKE0003|design-review>',
      'in [#design-review](slack-channel:TFAKE0001/CFAKE0003)'
    ],
    ['a broadcast', '<!here> look', '@here look'],
    ['a user group', '<!subteam^SFAKE0001|@designers>', '@designers'],
    ['a date', '<!date^1700000000^{date}|Nov 14>', 'Nov 14'],
    ['entities', 'a &lt; b &amp;&amp; c &gt; d', 'a \\< b \\&\\& c \\> d'],
    [
      'mid-word markers stay text',
      'snake_case_name and 2*3*4',
      'snake\\_case\\_name and 2\\*3\\*4'
    ],
    ['an unclosed marker', 'a *lonely star', 'a \\*lonely star'],
    ['a space-padded marker', 'a * b * c', 'a \\* b \\* c'],
    ['markers do not cross lines', '*one\ntwo*', '\\*one\ntwo\\*']
  ])('converts %s', (_name, input, output) => {
    expect(slackMrkdwnToMarkdown(input, OPTIONS)).toBe(output)
  })

  it.each([
    ['raw HTML', '&lt;img src=x onerror=alert(1)&gt;', '\\<img src=x onerror=alert(1)\\>'],
    ['a markdown link', '[click](javascript:alert(1))', '\\[click\\](javascript:alert(1))'],
    ['a markdown image', '![x](https://example.com/x.png)', '!\\[x\\](https://example.com/x.png)'],
    ['a heading', '# Title', '\\# Title'],
    ['a list', '- item\n+ item\n1. item', '\\- item\n\\+ item\n1\\. item'],
    ['a setext underline', 'Title\n===', 'Title\n\\==='],
    ['a table', 'a | b', 'a \\| b'],
    ['an indented code block', '    indented', '\u00a0\u00a0\u00a0\u00a0indented'],
    ['an html entity', '&amp;copy;', '\\&copy;'],
    ['backslashes', 'C:\\path', 'C:\\\\path'],
    // Slack reads the outer pair as the markers; the inner stars stay literal.
    ['emphasis written markdown-style', '**bold**', '**\\*bold**\\*']
  ])('escapes %s', (_name, input, output) => {
    expect(slackMrkdwnToMarkdown(input, OPTIONS)).toBe(output)
  })

  it('refuses links that are not http, https or mailto', () => {
    expect(slackMrkdwnToMarkdown('<javascript:alert(1)|click>', OPTIONS)).toBe('click')
    expect(slackMrkdwnToMarkdown('<file:///etc/passwd>', OPTIONS)).toBe('file:///etc/passwd')
    expect(slackMrkdwnToMarkdown('<slack-user:TFAKE0001/UFAKE0002|x>', OPTIONS)).toBe('x')
  })

  it('escapes link labels', () => {
    expect(slackMrkdwnToMarkdown('<https://example.com|a](https://evil.example)>', OPTIONS)).toBe(
      '[a\\](https://evil.example)](<https://example.com>)'
    )
  })

  it('keeps mentions as plain text without a team, and names them from the lookups', () => {
    expect(slackMrkdwnToMarkdown('<@UFAKE0002> <#CFAKE0003>')).toBe('@UFAKE0002 #CFAKE0003')
    expect(
      slackMrkdwnToMarkdown('<@UFAKE0002> in <#CFAKE0003>', {
        ...OPTIONS,
        domain: 'acme',
        userNames: { UFAKE0002: 'Sam' },
        channelNames: { CFAKE0003: 'design-review' }
      })
    ).toBe(
      '[@Sam](slack-user:TFAKE0001/UFAKE0002?d=acme) in [#design-review](slack-channel:TFAKE0001/CFAKE0003?d=acme)'
    )
  })

  it('keeps a mention with a malformed id as text', () => {
    expect(slackMrkdwnToMarkdown('<@nobody|sam> <#nowhere>', OPTIONS)).toBe('sam #nowhere')
  })

  it('escapes mention labels', () => {
    expect(slackMrkdwnToMarkdown('<@UFAKE0002|*sam*>', OPTIONS)).toBe(
      '[@\\*sam\\*](slack-user:TFAKE0001/UFAKE0002)'
    )
  })

  it('ends a code block at the first closing fence, as Slack does', () => {
    expect(slackMrkdwnToMarkdown('```a ``` b```', OPTIONS)).toBe('```\na \n```\n\u00a0b\\`\\`\\`')
    expect(slackMrkdwnToMarkdown('```\nx `` y\n```', OPTIONS)).toBe('```\nx `` y\n```')
  })

  it('caps the input and stays fast on pathological markers', () => {
    const started = Date.now()
    const output = slackMrkdwnToMarkdown('*_~'.repeat(5000), OPTIONS)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(output.length).toBeGreaterThan(0)
    expect(parseSlackMrkdwn('x'.repeat(9000))).toEqual([{ type: 'text', text: 'x'.repeat(8000) }])
  })
})

describe('parseSlackMrkdwn', () => {
  it('gives the UIs a tree they can draw without markdown', () => {
    expect(parseSlackMrkdwn('hi <@UFAKE0002|sam>, *see*\n<https://example.com|this>')).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'user', userId: 'UFAKE0002', label: 'sam' },
      { type: 'text', text: ', ' },
      { type: 'bold', children: [{ type: 'text', text: 'see' }] },
      { type: 'break' },
      { type: 'link', url: 'https://example.com', label: 'this' }
    ])
  })
})
