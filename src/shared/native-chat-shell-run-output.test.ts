import { describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_SHELL_RUN_QUIET_PROMPT_MS,
  detectNativeChatShellRunInputPrompt,
  truncateNativeChatShellRunOutput
} from './native-chat-shell-run-output'

describe('truncateNativeChatShellRunOutput', () => {
  it('keeps short output whole', () => {
    expect(truncateNativeChatShellRunOutput('a\nb')).toEqual({ text: 'a\nb', truncated: false })
  })

  it('keeps the last lines when there are too many', () => {
    const text = Array.from({ length: 250 }, (_, index) => `line ${index}`).join('\n')
    const kept = truncateNativeChatShellRunOutput(text)
    expect(kept.truncated).toBe(true)
    expect(kept.text.split('\n')).toHaveLength(200)
    expect(kept.text.startsWith('line 50\n')).toBe(true)
    expect(kept.text.endsWith('line 249')).toBe(true)
  })

  it('keeps the last bytes when the lines are long', () => {
    const text = Array.from({ length: 10 }, () => 'x'.repeat(10_000)).join('\n')
    const kept = truncateNativeChatShellRunOutput(text)
    expect(kept.truncated).toBe(true)
    expect(new TextEncoder().encode(kept.text).length).toBeLessThanOrEqual(64 * 1024)
  })

  it('cuts a single oversized line to its end', () => {
    const kept = truncateNativeChatShellRunOutput(`${'a'.repeat(100)}END`, 200, 40)
    expect(kept.truncated).toBe(true)
    expect(kept.text.endsWith('END')).toBe(true)
    expect(kept.text.length).toBeLessThanOrEqual(40)
  })
})

describe('detectNativeChatShellRunInputPrompt', () => {
  it.each([
    ['Password:', 'secret'],
    ['[sudo] password for jake: ', 'secret'],
    ['Enter passphrase for key /x: ', 'secret'],
    ['Proceed? [Y/n] ', 'confirm'],
    ['Overwrite file? (y/n) ', 'confirm'],
    ['Are you sure you want to continue?', 'confirm'],
    ['Press any key to continue...', 'key'],
    ['Press Enter to open the browser', 'key'],
    ['\u001b[1mPassword:\u001b[0m ', 'secret']
  ])('reads %j as %s at once', (line, kind) => {
    expect(detectNativeChatShellRunInputPrompt(`output\n${line}`, 0)).toBe(kind)
  })

  it('reads a plain prompt only once the run has gone quiet', () => {
    expect(detectNativeChatShellRunInputPrompt('Name: ', 200)).toBeNull()
    expect(
      detectNativeChatShellRunInputPrompt('Name: ', NATIVE_CHAT_SHELL_RUN_QUIET_PROMPT_MS)
    ).toBe('prompt')
  })

  it('ignores finished lines and ordinary output', () => {
    expect(detectNativeChatShellRunInputPrompt('Password:\n', 10_000)).toBeNull()
    expect(detectNativeChatShellRunInputPrompt('Compiling 3 files', 10_000)).toBeNull()
    expect(detectNativeChatShellRunInputPrompt('', 10_000)).toBeNull()
  })
})
