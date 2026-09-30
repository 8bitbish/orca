// Launch an isolated copy of personal build A, let its real updater find, download and
// install build B from the fork, then report the version on disk. See DECISIONS.md.
// Usage: PLAYWRIGHT_PATH=$(node -p 'require.resolve("playwright")') node personal-build/verify-update.cjs <A.app>
const { _electron } = require(process.env.PLAYWRIGHT_PATH)
const { mkdtempSync, readFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const appPath = process.argv[2]
const plistVersion = () =>
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleShortVersionString', path.join(appPath, 'Contents/Info.plist')], { encoding: 'utf8' }).trim()

async function main() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-update-test-'))
  const home = path.join(root, 'home')
  const userData = path.join(root, 'userData')
  require('node:fs').mkdirSync(home, { recursive: true })
  const before = plistVersion()
  console.log('on disk before:', before)
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env
  const app = await _electron.launch({
    executablePath: path.join(appPath, 'Contents/MacOS/Orca'),
    // The isolated HOME has no Keychain; without this macOS prompts to create one.
    args: ['--use-mock-keychain'],
    env: { ...env, HOME: home, ORCA_E2E_USER_DATA_DIR: userData, ORCA_E2E_HOME_DIR: home, ORCA_E2E_HEADLESS: '1' },
    timeout: 120_000
  })
  await app.firstWindow({ timeout: 120_000 })
  let page = null
  for (let i = 0; i < 120 && !page; i++) {
    for (const w of app.windows()) {
      if (await w.evaluate(() => Boolean(window.api?.updater)).catch(() => false)) page = w
    }
    if (!page) await new Promise((r) => setTimeout(r, 1000))
  }
  if (!page) throw new Error('no window exposes window.api.updater')
  console.log('running version:', await page.evaluate(() => window.api.updater.getVersion()))

  const statuses = []
  await page.exposeFunction('__recordStatus', (s) => {
    statuses.push(s)
    console.log('status:', JSON.stringify(s).slice(0, 300))
  })
  await page.evaluate(() => window.api.updater.onStatus((s) => window.__recordStatus(s)))
  const waitFor = async (states, ms) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      const s = await page.evaluate(() => window.api.updater.getStatus())
      if (states.includes(s.state)) return s
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error(`timed out waiting for ${states.join('/')}; last: ${JSON.stringify(statuses.at(-1))}`)
  }

  await page.evaluate(() => window.api.updater.check())
  const found = await waitFor(['available', 'not-available', 'error'], 120_000)
  console.log('check result:', JSON.stringify(found))
  if (found.state !== 'available') throw new Error('no update offered')
  await page.evaluate(() => window.api.updater.download())
  const downloaded = await waitFor(['downloaded', 'error'], 600_000)
  console.log('download result:', JSON.stringify(downloaded))
  if (downloaded.state !== 'downloaded') throw new Error('download failed')

  const closed = new Promise((r) => app.process().once('exit', r))
  page.evaluate(() => window.api.updater.quitAndInstall()).catch(() => {})
  await Promise.race([closed, new Promise((r) => setTimeout(r, 120_000))])
  console.log('app exited; waiting for ShipIt to swap the bundle')
  const end = Date.now() + 180_000
  while (Date.now() < end && plistVersion() === before) {
    await new Promise((r) => setTimeout(r, 2000))
  }
  const after = plistVersion()
  console.log('on disk after:', after)
  process.exit(after !== before ? 0 : 1)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(2)
})
