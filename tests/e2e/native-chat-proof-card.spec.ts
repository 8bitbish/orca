import { randomUUID } from 'node:crypto'
import {
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
import { waitForActivePaneHookDescriptor, waitForActiveTerminalManager } from './helpers/terminal'
import type { GlobalSettings } from '../../src/shared/global-settings-types'

// Personal-build check: renders the fixture proof bundle (an ffmpeg test-pattern
// MP4 and a before/after PNG pair) through the real IPC and media pipeline. The
// bundle lives on this Mac, so the spec skips where it is absent. The app runs with
// an isolated HOME, so the bundle is copied into that home's proof folder; the card's
// absolute paths name the real home, and the renderer reduces them to the
// proof-relative part, which the host then resolves in its own home.
const FIXTURE = path.join(os.homedir(), '.orca-personal', 'proof', '_fixture')
const FIXTURE_CARD = path.join(FIXTURE, 'proof.json')

async function applySettings(page: Page, settings: Partial<GlobalSettings>): Promise<void> {
  await page.evaluate(async (next) => {
    const saved = await window.api.settings.set(next)
    window.__store?.setState({ settings: saved as GlobalSettings })
  }, settings)
}

async function showChatView(page: Page, args: { tabId: string; worktreeId: string }) {
  await page.evaluate(({ tabId, worktreeId }) => {
    const state = window.__store?.getState()
    const tab = (state?.unifiedTabsByWorktree[worktreeId] ?? []).find(
      (entry) => entry.contentType === 'terminal' && entry.entityId === tabId
    )
    if (!state || !tab) {
      throw new Error('Terminal tab not found for chat toggle')
    }
    state.toggleTabViewMode(tab.id)
  }, args)
}

function transcript(sessionId: string, reply: string): string {
  const at = Date.now()
  const lines = [
    {
      sessionId,
      uuid: `${sessionId}-user`,
      timestamp: new Date(at).toISOString(),
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Show me the proof' }] }
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

test.describe('Desktop chat proof card', () => {
  test.skip(!existsSync(FIXTURE_CARD), 'needs ~/.orca-personal/proof/_fixture')

  test('plays the recording, compares before/after and grades checks, light and dark', async ({
    orcaPage,
    electronApp
  }) => {
    const appHome = await electronApp.evaluate(({ app }) => app.getPath('home'))
    // A tall window keeps the whole card in view for the screenshots.
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1400, 1900)
    })
    cpSync(FIXTURE, path.join(appHome, '.orca-personal', 'proof', '_fixture'), { recursive: true })
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    await waitForActiveTerminalManager(orcaPage, 30_000)
    const descriptor = await waitForActivePaneHookDescriptor(orcaPage)
    const [tabId] = descriptor.paneKey.split(':')
    const sessionId = `e2e-proof-card-${randomUUID()}`
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-proof-card-'))
    const transcriptPath = path.join(scratch, `${sessionId}.jsonl`)
    const shots = path.join(process.cwd(), 'validation-screenshots', 'proof-card')
    mkdirSync(shots, { recursive: true })
    try {
      const card = readFileSync(FIXTURE_CARD, 'utf8').trim()
      writeFileSync(
        transcriptPath,
        transcript(sessionId, `Here's the proof.\n\n\`\`\`proof-card\n${card}\n\`\`\`\n`)
      )
      await applySettings(orcaPage, { experimentalNativeChat: true, theme: 'light' })
      await orcaPage.evaluate(
        ({ paneKey, worktreeId, sessionId: id, transcriptPath: file }) => {
          window.__store
            ?.getState()
            .setAgentStatus(
              paneKey,
              { state: 'done', prompt: 'Proof card', agentType: 'claude' },
              'Claude',
              undefined,
              { worktreeId },
              { providerSession: { key: 'session_id', id, transcriptPath: file } }
            )
        },
        {
          paneKey: descriptor.paneKey,
          worktreeId: descriptor.worktreeId,
          sessionId,
          transcriptPath
        }
      )
      await showChatView(orcaPage, { tabId, worktreeId: descriptor.worktreeId })

      const proof = orcaPage.locator('[data-native-chat-proof-card]')
      await expect(proof).toBeVisible({ timeout: 30_000 })
      const video = proof.locator('video[data-proof-video]')
      await expect(video).toHaveAttribute('src', /^blob:/, { timeout: 15_000 })
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), {
          timeout: 15_000
        })
        .toBeGreaterThanOrEqual(2)
      expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true)
      expect(await video.evaluate((element: HTMLVideoElement) => element.loop)).toBe(true)
      expect(await video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(390)

      const slider = proof.getByRole('slider', { name: 'Drag to compare before and after' })
      await expect(slider).toBeVisible()
      await expect(proof.locator('[data-proof-check="pass"]')).toHaveCount(1)
      await expect(proof.locator('[data-proof-check="fail"]')).toHaveCount(1)
      await expect(proof.locator('[data-proof-check="unchecked"]')).toHaveCount(1)
      await proof.scrollIntoViewIfNeeded()
      await proof.screenshot({ path: path.join(shots, '01-light.png') })

      // Dragging the handle moves the split.
      const box = await slider.boundingBox()
      if (!box) {
        throw new Error('Slider has no box')
      }
      await orcaPage.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2)
      await expect(proof.locator('[data-proof-compare-before]')).toHaveAttribute(
        'style',
        /inset\(0px 7\d% 0px 0px\)|inset\(0 7\d% 0 0\)/
      )
      await proof.screenshot({ path: path.join(shots, '02-light-dragged.png') })

      await applySettings(orcaPage, { theme: 'dark' })
      await expect
        .poll(() => orcaPage.evaluate(() => document.documentElement.classList.contains('dark')))
        .toBe(true)
      await proof.screenshot({ path: path.join(shots, '03-dark.png') })
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
