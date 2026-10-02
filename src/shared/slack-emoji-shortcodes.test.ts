import { describe, expect, it } from 'vitest'
import { parseSlackMrkdwn, slackMrkdwnToMarkdown } from './native-chat-slack-mrkdwn'
import { replaceSlackEmojiShortcodes as emoji } from './slack-emoji-shortcodes'

// Made-up text only.
describe('replaceSlackEmojiShortcodes', () => {
  it.each([
    ['a known code', 'thanks :slightly_smiling_face:', 'thanks 🙂'],
    ['joy', ':joy:', '😂'],
    ['the +1 alias', ':+1:', '👍'],
    ['the thumbsup alias', ':thumbsup:', '👍'],
    ['the -1 alias', ':-1:', '👎'],
    ['heart with its variation selector', ':heart:', '❤️'],
    ['a Slack-only alias', ':simple_smile:', '🙂'],
    ['a keycap', ':hash:', '#️⃣'],
    ['a flag', ':flag-gb:', '🇬🇧'],
    ['a ZWJ sequence', ':man-raising-hand:', '🙋‍♂️'],
    ['adjacent codes', ':tada::rocket::fire:', '🎉🚀🔥'],
    ['codes against punctuation', 'done (:white_check_mark:), ok:+1:!', 'done (✅), ok👍!'],
    ['codes against words', 'nice:joy:work', 'nice😂work'],
    ['a code at line ends', ':eyes:\n:eyes:', '👀\n👀']
  ])('converts %s', (_name, input, output) => {
    expect(emoji(input)).toBe(output)
  })

  it.each([
    ['a skin tone after a code', ':ok_hand::skin-tone-2:', '👌🏻'],
    ['the darkest tone', ':wave::skin-tone-6:', '👋🏿'],
    ['a tone on an alias', ':+1::skin-tone-3:', '👍🏼'],
    ['a tone on a typed emoji', '👋:skin-tone-4:', '👋🏽'],
    ['a tone on a ZWJ sequence', ':man-raising-hand::skin-tone-5:', '🙋🏾‍♂️'],
    ['a tone on a two-person emoji', ':people_holding_hands::skin-tone-2:', '🧑🏻‍🤝‍🧑🏻'],
    ['a tone dropped where the emoji has none', ':joy::skin-tone-3:', '😂'],
    ['a lone tone as its swatch', 'tone :skin-tone-3:', 'tone 🏼'],
    ['a second tone as its swatch', ':wave::skin-tone-2::skin-tone-3:', '👋🏻🏼'],
    ['no tone past 6', ':wave::skin-tone-7:', '👋:skin-tone-7:']
  ])('applies %s', (_name, input, output) => {
    expect(emoji(input)).toBe(output)
  })

  it.each([
    ['an unknown code', ':not_a_real_emoji:'],
    ['a custom workspace emoji', 'ship it :partyparrot:'],
    ['a custom emoji with a tone', ':partyparrot::skin-tone-2:'],
    ['upper case', ':JOY:'],
    ['an unclosed code', 'ratio :joy and more'],
    ['a time', 'at 10:30 or 11:45'],
    ['a lone colon', 'note: this'],
    ['an empty code', '::'],
    ['inline code', 'type `:joy:` to react'],
    ['a code block', '```\n:joy:\n```'],
    ['a URL', 'see https://example.com/a/:joy:/b?x=:tada:'],
    ['a prototype key', ':constructor: :__proto__: :hasOwnProperty:'],
    ['malformed tones', ':skin-tone-::skin-tone-23::skin-tone-7:']
  ])('leaves %s as written', (_name, input) => {
    expect(emoji(input)).toBe(input)
  })

  it('converts around code and URLs', () => {
    expect(emoji(':joy: `:joy:` https://example.com/:joy: :joy:')).toBe(
      '😂 `:joy:` https://example.com/:joy: 😂'
    )
  })

  it('keeps a custom code and still converts the next one', () => {
    expect(emoji(':partyparrot::joy:')).toBe(':partyparrot:😂')
  })
})

describe('Slack mrkdwn emoji', () => {
  const OPTIONS = { teamId: 'TFAKE0001' }

  it('converts codes in text, emphasis and link labels', () => {
    expect(slackMrkdwnToMarkdown('*great* :tada: _ok :ok_hand::skin-tone-2:_', OPTIONS)).toBe(
      '**great** 🎉 *ok 👌🏻*'
    )
    expect(slackMrkdwnToMarkdown('<https://example.com/:joy:|see :eyes:>', OPTIONS)).toBe(
      '[see 👀](<https://example.com/:joy:>)'
    )
  })

  it('leaves code, bare links and mentions untouched', () => {
    expect(slackMrkdwnToMarkdown('run `:joy:` then\n```\n:tada:\n```', OPTIONS)).toBe(
      'run `:joy:` then\n\n```\n:tada:\n```'
    )
    expect(slackMrkdwnToMarkdown('<https://example.com/:joy:>', OPTIONS)).toBe(
      '[https://example.com/:joy:](<https://example.com/:joy:>)'
    )
    expect(slackMrkdwnToMarkdown('<@UFAKE0002|sam:joy:> :joy:', OPTIONS)).toBe(
      '[@sam:joy:](slack-user:TFAKE0001/UFAKE0002) 😂'
    )
  })

  it('escapes an unknown code like any other text', () => {
    expect(slackMrkdwnToMarkdown(':custom_one: :joy:', OPTIONS)).toBe(':custom\\_one: 😂')
  })

  it('gives mobile emoji in the parse tree', () => {
    expect(parseSlackMrkdwn('hi :wave::skin-tone-3: `:wave:`')).toEqual([
      { type: 'text', text: 'hi 👋🏼 ' },
      { type: 'code', text: ':wave:' }
    ])
  })
})
