import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// Imported by the same relative path the mobile bundle uses.
import { replaceSlackEmojiShortcodes } from '../../../../src/shared/slack-emoji-shortcodes'

const SHARED = resolve(import.meta.dirname, '../../../../src/shared')
// Features Hermes lacks or that pull in Node or Intl.
const UNSAFE = [/\(\?<[=!]/, /\\p\{/, /Intl\./, /Buffer/, /node:/, /\.toSorted\(/, /require\(/]

describe('Slack emoji shortcodes on mobile', () => {
  it('converts through the mobile import path', () => {
    expect(replaceSlackEmojiShortcodes('ok :+1::skin-tone-5: `:joy:` :custom:')).toBe(
      'ok 👍🏾 `:joy:` :custom:'
    )
  })

  it.each(['slack-emoji-shortcodes.ts', 'slack-emoji-shortcodes-data.ts'])(
    'keeps %s free of APIs Hermes cannot run',
    (file) => {
      const source = readFileSync(resolve(SHARED, file), 'utf8')
      expect(UNSAFE.filter((pattern) => pattern.test(source))).toEqual([])
    }
  )
})
