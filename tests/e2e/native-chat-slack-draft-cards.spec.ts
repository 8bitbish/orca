import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActivePaneHookDescriptor, waitForActiveTerminalManager } from './helpers/terminal'
import type { GlobalSettings } from '../../src/shared/global-settings-types'

// Personal-build check: a ```slack-draft whose text tags people by bare id shows
// their names, read through real IPC from slack-mcp's cache in the app's (isolated)
// home. Made-up cache by default; ORCA_E2E_SLACK_REAL_IDS="U…,U…" also copies this
// Mac's real users.json and mentions those ids, for a local proof screenshot.
const REAL_IDS = (process.env.ORCA_E2E_SLACK_REAL_IDS ?? '').split(',').filter(Boolean)
const REAL_USERS = path.join(os.homedir(), 'Library', 'Caches', 'slack-mcp', 'users.json')

async function applySettings(page: Page, settings: Partial<GlobalSettings>): Promise<void> {
  await page.evaluate(async (next) => {
    const saved = await window.api.settings.set(next)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: settings.set returns the full saved GlobalSettings.
    window.__store?.setState({ settings: saved as GlobalSettings })
  }, settings)
}

function transcript(sessionId: string, reply: string): string {
  const at = Date.now()
  const lines = [
    {
      sessionId,
      uuid: `${sessionId}-user`,
      timestamp: new Date(at).toISOString(),
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Draft the reply' }] }
    },
    {
      sessionId,
      uuid: `${sessionId}-assistant`,
      timestamp: new Date(at + 2_000).toISOString(),
      type: 'assistant',
      message: { model: 'claude-opus-4', content: [{ type: 'text', text: reply }] }
    }
  ]
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
}

/** Opens the active terminal as a native chat whose one assistant reply is `reply`. */
async function openChatWithReply(page: Page, reply: string): Promise<() => void> {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await waitForActiveTerminalManager(page, 30_000)
  const descriptor = await waitForActivePaneHookDescriptor(page)
  const [tabId] = descriptor.paneKey.split(':')
  const sessionId = `e2e-slack-draft-${randomUUID()}`
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-slack-draft-'))
  const transcriptPath = path.join(scratch, `${sessionId}.jsonl`)
  writeFileSync(transcriptPath, transcript(sessionId, reply))
  await applySettings(page, { experimentalNativeChat: true, theme: 'dark' })
  await page.evaluate(
    ({ paneKey, worktreeId, sessionId: id, transcriptPath: file, tab }) => {
      const state = window.__store?.getState()
      state?.setAgentStatus(
        paneKey,
        { state: 'done', prompt: 'Slack draft', agentType: 'claude' },
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
  return () => rmSync(scratch, { recursive: true, force: true })
}

function fence(card: unknown): string {
  return `\`\`\`slack-draft\n${JSON.stringify(card)}\n\`\`\``
}

test.describe('Desktop chat Slack draft mention names', () => {
  test('shows names, not ids, for bare and labelled mentions', async ({
    orcaPage,
    electronApp
  }) => {
    const appHome = await electronApp.evaluate(({ app }) => app.getPath('home'))
    const cache = path.join(appHome, 'Library', 'Caches', 'slack-mcp')
    mkdirSync(cache, { recursive: true })
    const real = REAL_IDS.length > 0 && existsSync(REAL_USERS)
    if (real) {
      copyFileSync(REAL_USERS, path.join(cache, 'users.json'))
    } else {
      writeFileSync(
        path.join(cache, 'users.json'),
        JSON.stringify({
          UFAKE0010: { info: { name: 'Ada', realName: 'Ada L' } },
          UFAKE0011: { info: { name: 'Linus', realName: 'Linus P' } }
        })
      )
    }
    writeFileSync(
      path.join(cache, 'channels.json'),
      JSON.stringify({ CFAKE0013: { name: 'launch' } })
    )
    const ids = real ? REAL_IDS : ['UFAKE0010', 'UFAKE0011']
    const card = {
      teamId: 'TFAKE0001',
      domain: 'acme',
      channel: { name: 'design-review', id: 'CFAKE0003' },
      text: `${ids.map((id) => `<@${id}>`).join(' ')} the build is up, thanks <@UFAKE0012|Mo>. More in <#CFAKE0013>`,
      actions: [
        { label: 'Send', reply: 'Send the draft', style: 'primary' },
        { label: 'Edit…', input: true }
      ]
    }

    const shots = path.join(process.cwd(), 'validation-screenshots', 'slack-draft-names')
    mkdirSync(shots, { recursive: true })
    const cleanUp = await openChatWithReply(orcaPage, `Here's a draft.\n\n${fence(card)}\n`)
    try {
      const draft = orcaPage.locator('[data-native-chat-slack-card="draft"]')
      await expect(draft).toBeVisible({ timeout: 30_000 })
      const chips = draft.locator('[data-native-chat-slack-chip="user"]')
      if (!real) {
        await expect(chips.filter({ hasText: '@Ada' })).toHaveCount(1)
        await expect(chips.filter({ hasText: '@Linus' })).toHaveCount(1)
      }
      await expect(chips.filter({ hasText: '@Mo' })).toHaveCount(1)
      await expect(
        draft.locator('[data-native-chat-slack-chip="channel"]', { hasText: '#launch' })
      ).toHaveCount(1)
      await expect(draft).not.toContainText(/@U[A-Z0-9]{6,}/)
      await draft.scrollIntoViewIfNeeded()
      await draft.screenshot({ path: path.join(shots, real ? 'draft-real.png' : 'draft.png') })
    } finally {
      cleanUp()
    }
  })

  test('quotes the message a draft answers, on Slack, WhatsApp and Messenger', async ({
    orcaPage
  }) => {
    const send = [{ label: 'Send', reply: 'Send the draft', style: 'primary' }]
    const slack = {
      teamId: 'TFAKE0001',
      domain: 'acme',
      to: { name: 'Sam', userId: 'UFAKE0002' },
      channel: { name: 'design-review', id: 'CFAKE0003' },
      threadTs: '1700000000.000100',
      replyTo: {
        from: { name: 'Sam', userId: 'UFAKE0002' },
        text: 'Can you check the *sidebar* build before Friday? The overlay still clips on small windows.',
        ts: '1700000000.000200',
        permalink: 'https://acme.slack.com/archives/CFAKE0003/p1700000000000200'
      },
      text: 'Checked it, the clipping is fixed in today’s build. Overlay it is!',
      actions: [...send, { label: 'Edit…', input: true }]
    }
    const whatsapp = {
      platform: 'whatsapp',
      chat: { name: 'Climbing crew', id: '120363000000000000@g.us' },
      replyTo: { from: { name: 'Alex' }, text: 'Anyone up for the wall on _Thursday_?' },
      text: 'I’m in, 7pm works 👍',
      actions: send
    }
    const messenger = {
      platform: 'messenger',
      chat: { name: 'Robin', id: '1000000000000001' },
      replyTo: { from: { name: 'Robin' }, text: 'Still on for Sunday lunch?' },
      text: 'Yes! See you at 1.',
      actions: send
    }
    const shots = path.join(process.cwd(), 'validation-screenshots', 'slack-draft-reply')
    mkdirSync(shots, { recursive: true })
    const cleanUp = await openChatWithReply(
      orcaPage,
      `Three drafts.\n\n${fence(slack)}\n\n${fence(whatsapp)}\n\n${fence(messenger)}\n`
    )
    try {
      const drafts = orcaPage.locator('[data-native-chat-slack-card="draft"]')
      await expect(drafts).toHaveCount(3, { timeout: 30_000 })
      for (const [index, platform] of ['slack', 'whatsapp', 'messenger'].entries()) {
        const card = drafts.nth(index)
        await expect(card).toHaveAttribute('data-chat-draft-platform', platform)
        await expect(card.locator('[data-slack-draft-reply-to]')).toContainText('Replying to')
        await card.scrollIntoViewIfNeeded()
        await card.screenshot({ path: path.join(shots, `${platform}.png`) })
      }
      const slackCard = drafts.nth(0)
      await expect(
        slackCard.locator('[data-slack-draft-reply-to] [data-native-chat-slack-chip="message"]')
      ).toHaveCount(1)
      await expect(drafts.nth(1)).toContainText('WhatsApp')
      await expect(drafts.nth(1).locator('[data-native-chat-slack-chip]')).toHaveCount(0)
      await expect(drafts.nth(2)).toContainText('Messenger')
    } finally {
      cleanUp()
    }
  })
})
