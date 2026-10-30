import { randomUUID } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  waitForActivePaneHookDescriptor,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'
import type { GlobalSettings } from '../../src/shared/global-settings-types'

// Personal-build check: a press on any chat card's button reaches the agent as
// `Re: <project> · <title>: <reply>` plus a `[companion-context] {json}` line, and the
// sent bubble hides that line. The pane's shell runs `cat` into a file, so the file
// holds exactly what the agent's terminal received.
const FIXTURE = path.join(os.homedir(), '.orca-personal', 'proof', '_fixture')
const FIXTURE_CARD = path.join(FIXTURE, 'proof.json')

async function applySettings(page: Page, settings: Partial<GlobalSettings>): Promise<void> {
  await page.evaluate(async (next) => {
    const saved = await window.api.settings.set(next)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: settings.set returns the full saved GlobalSettings.
    window.__store?.setState({ settings: saved as GlobalSettings })
  }, settings)
}

function line(sessionId: string, role: 'user' | 'assistant', text: string, at: number): string {
  return JSON.stringify({
    sessionId,
    uuid: `${sessionId}-${role}-${at}`,
    timestamp: new Date(at).toISOString(),
    type: role,
    message:
      role === 'user'
        ? { role, content: [{ type: 'text', text }] }
        : { model: 'claude-opus-4', content: [{ type: 'text', text }] }
  })
}

function fence(language: string, card: unknown): string {
  return `\`\`\`${language}\n${typeof card === 'string' ? card : JSON.stringify(card)}\n\`\`\``
}

/** What `cat` wrote: bracketed-paste markers and terminal control bytes removed. */
function received(file: string): string[] {
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : ''
  return (
    raw
      // oxlint-disable-next-line no-control-regex -- strips the terminal's paste markers and control bytes.
      .replace(/\x1b\[20[01]~/g, '')
      // oxlint-disable-next-line no-control-regex -- see above.
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
      .split('\n')
      .filter((entry) => entry.trim() !== '')
  )
}

test.describe('Desktop chat card presses', () => {
  test.skip(!existsSync(FIXTURE_CARD), 'needs ~/.orca-personal/proof/_fixture')

  test('every card button names its card and the bubble hides the tag', async ({
    orcaPage,
    electronApp
  }) => {
    const appHome = await electronApp.evaluate(({ app }) => app.getPath('home'))
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1200, 1900)
    })
    cpSync(FIXTURE, path.join(appHome, '.orca-personal', 'proof', '_fixture'), { recursive: true })
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    await waitForActiveTerminalManager(orcaPage, 30_000)
    const descriptor = await waitForActivePaneHookDescriptor(orcaPage)
    const [tabId] = descriptor.paneKey.split(':')
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-card-press-'))
    const capture = path.join(scratch, 'received.txt')
    await execInTerminal(
      orcaPage,
      await waitForActivePanePtyId(orcaPage),
      `stty -echo; cat > '${capture}'`
    )

    const sessionId = `e2e-card-press-${randomUUID()}`
    const transcriptPath = path.join(scratch, `${sessionId}.jsonl`)
    const reply = [
      'Four things for you.',
      fence('proof-card', readFileSync(FIXTURE_CARD, 'utf8').trim()),
      fence('project-card', {
        worktree: descriptor.worktreeId,
        ask: 'Build is signed. Install it now?',
        actions: [
          { label: 'Install it', reply: 'Install it', style: 'primary' },
          { label: 'Not now', reply: 'Not now' }
        ]
      }),
      fence('slack-message', {
        status: 'needs-you',
        teamId: 'TFAKE0001',
        domain: 'acme',
        from: { name: 'Sam', userId: 'UFAKE0002' },
        channel: { name: 'design-review', id: 'CFAKE0003', kind: 'channel' },
        ts: '1700000000.000100',
        summary: 'Wants a call on the sidebar: overlay or push?',
        actions: [{ label: 'Overlay', reply: 'Draft a reply going with overlay', style: 'primary' }]
      }),
      fence('slack-draft', {
        platform: 'whatsapp',
        chat: { name: 'Climbing crew', id: '120363000000000000@g.us' },
        replyTo: { from: { name: 'Alex' }, text: 'Anyone up for the wall on Thursday?' },
        text: 'I’m in, 7pm works',
        actions: [
          { label: 'Send', reply: 'Send it', style: 'primary' },
          { label: 'Edit…', input: true }
        ]
      })
    ].join('\n\n')
    const start = Date.now()
    writeFileSync(
      transcriptPath,
      `${line(sessionId, 'user', 'What needs me?', start)}\n${line(sessionId, 'assistant', reply, start + 1_000)}\n`
    )
    await applySettings(orcaPage, { experimentalNativeChat: true, theme: 'dark' })
    await orcaPage.evaluate(
      ({ paneKey, worktreeId, sessionId: id, transcriptPath: file, tab }) => {
        const state = window.__store?.getState()
        state?.setAgentStatus(
          paneKey,
          { state: 'done', prompt: 'Card press', agentType: 'claude' },
          'Claude',
          undefined,
          { worktreeId },
          { providerSession: { key: 'session_id', id, transcriptPath: file } }
        )
        const entry = (state?.unifiedTabsByWorktree[worktreeId] ?? []).find(
          (candidate) => candidate.contentType === 'terminal' && candidate.entityId === tab
        )
        if (!state || !entry) {
          throw new Error('Terminal tab not found for chat toggle')
        }
        state.toggleTabViewMode(entry.id)
      },
      {
        paneKey: descriptor.paneKey,
        worktreeId: descriptor.worktreeId,
        sessionId,
        transcriptPath,
        tab: tabId
      }
    )

    const shots = path.join(process.cwd(), 'validation-screenshots', 'card-press')
    mkdirSync(shots, { recursive: true })
    try {
      const proof = orcaPage.locator('[data-native-chat-proof-card]')
      const project = orcaPage.locator('[data-native-chat-project-card]')
      const message = orcaPage.locator('[data-native-chat-slack-card="message"]')
      const draft = orcaPage.locator('[data-native-chat-slack-card="draft"]')
      await expect(proof).toBeVisible({ timeout: 30_000 })
      await expect(draft).toBeVisible()

      const presses = [
        { card: proof, button: /^Looks right/ },
        { card: project, button: /^Install it/ },
        { card: message, button: /^Overlay/ },
        { card: draft, button: /^Send/ }
      ]
      for (const [index, press] of presses.entries()) {
        await press.card.scrollIntoViewIfNeeded()
        await press.card.getByRole('button', { name: press.button }).click()
        await expect(press.card.locator('[data-project-action-chosen="true"]')).toHaveCount(1)
        await expect.poll(() => received(capture).length, { timeout: 10_000 }).toBe((index + 1) * 2)
      }

      const sent = received(capture)
      const tags = sent.filter((_, index) => index % 2 === 1)
      const lines = sent.filter((_, index) => index % 2 === 0)
      expect(lines).toHaveLength(4)
      expect(lines[0]).toBe(
        'Re: orca-personal · Proof card fixture: recording, slider and checks: Looks right, ship it'
      )
      // The project card names the workspace as it shows it.
      const projectName = await project
        .locator('div.truncate.text-sm.font-semibold')
        .first()
        .innerText()
      expect(lines[1]).toBe(`Re: ${projectName} · Build is signed. Install it now?: Install it`)
      expect(lines[2]).toBe(
        'Re: Slack · Sam in #design-review: Wants a call on the sidebar: overlay or push?: Draft a reply going with overlay'
      )
      expect(lines[3]).toBe('Re: Whatsapp · Draft to Climbing crew: Send it')
      const parsedTags = tags.map((tag) => {
        expect(tag.startsWith('[companion-context] ')).toBe(true)
        const value: unknown = JSON.parse(tag.slice('[companion-context] '.length))
        return typeof value === 'object' && value !== null ? { ...value } : {}
      })
      expect(parsedTags.map((tag) => tag.kind)).toEqual([
        'proof-card',
        'project-card',
        'slack-message',
        'slack-draft'
      ])
      expect(parsedTags[0]).toMatchObject({
        type: 'button',
        label: 'Looks right',
        worktree: 'orca-personal/personal'
      })
      expect(String(parsedTags[0].proof)).toMatch(/\.orca-personal\/proof\/_fixture$/)
      expect(parsedTags[2]).toMatchObject({ channel: 'CFAKE0003', ts: '1700000000.000100' })
      expect(parsedTags[3]).toMatchObject({ chat: '120363000000000000@g.us' })
      writeFileSync(path.join(shots, 'received.txt'), `${sent.join('\n')}\n`)

      // The agent's transcript then holds the presses; the bubbles show line 1 only.
      for (const [index, text] of sent.entries()) {
        if (index % 2 === 0) {
          appendFileSync(
            transcriptPath,
            `${line(sessionId, 'user', `${text}\n${sent[index + 1]}`, start + 2_000 + index)}\n`
          )
        }
      }
      const bubble = orcaPage.getByText('Re: Whatsapp · Draft to Climbing crew: Send it', {
        exact: true
      })
      await expect(bubble).toBeVisible({ timeout: 30_000 })
      const chat = orcaPage.locator('[data-native-chat-message-id]')
      await expect(chat.filter({ hasText: '[companion-context]' })).toHaveCount(0)
      await bubble.scrollIntoViewIfNeeded()
      await orcaPage.screenshot({ path: path.join(shots, 'bubbles.png') })
      await proof.scrollIntoViewIfNeeded()
      await orcaPage.screenshot({ path: path.join(shots, 'cards-top.png') })
      await draft.scrollIntoViewIfNeeded()
      await orcaPage.screenshot({ path: path.join(shots, 'cards-bottom.png') })
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
