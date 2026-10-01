// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { createNativeChatShellRunScreen } from './native-chat-shell-run-screen'

describe('createNativeChatShellRunScreen', () => {
  it('keeps column gaps, redraws and colours the way a terminal shows them', async () => {
    const screen = createNativeChatShellRunScreen()
    await screen.write('CLAUDE.md\tREADME.md\tsrc\r\n')
    await screen.write('progress 10%\rprogress 99%\r\n')
    await screen.write('\u001b[31mred\u001b[0m done\r\n')
    expect(screen.text()).toBe(
      'CLAUDE.md       README.md       src\nprogress 99%\n\u001b[31mred\u001b[0m done'
    )
    screen.dispose()
  })

  it('reports the line the cursor waits on', async () => {
    const screen = createNativeChatShellRunScreen()
    await screen.write('hello\r\nYour name: ')
    expect(screen.cursorLine()).toBe('Your name: ')
    await screen.write('Jake\r\n')
    expect(screen.cursorLine()).toBe('')
    screen.dispose()
  })
})
