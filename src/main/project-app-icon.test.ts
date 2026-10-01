import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findProjectAppIcon, getProjectAppIcon } from './project-app-icon'

// Two distinct 1x1 PNGs, so a test can tell which file was chosen.
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
)
const BLUE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
  'base64'
)

let repo: string

function write(relativePath: string, contents: Buffer | string): void {
  const filePath = path.join(repo, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents)
}

function dataUri(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`
}

beforeEach(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), 'orca-project-app-icon-'))
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('findProjectAppIcon', () => {
  it('prefers an Xcode AppIcon set, choosing its largest image', async () => {
    write('build/icon.png', BLUE_PNG)
    const set = 'ios/App/Assets.xcassets/AppIcon.appiconset'
    write(`${set}/Contents.json`, '{"images":[]}')
    write(`${set}/icon-20.png`, RED_PNG)
    write(`${set}/icon-1024.png`, Buffer.concat([RED_PNG, Buffer.alloc(64)]))
    const src = await findProjectAppIcon(repo)
    expect(src?.startsWith('data:image/png;base64,')).toBe(true)
    expect(Buffer.from((src ?? '').split(',')[1] ?? '', 'base64').length).toBe(RED_PNG.length + 64)
  })

  it('skips an icon set without Contents.json and ignores dependency folders', async () => {
    write('node_modules/pkg/Assets.xcassets/AppIcon.appiconset/Contents.json', '{}')
    write('node_modules/pkg/Assets.xcassets/AppIcon.appiconset/icon.png', RED_PNG)
    write('App/Assets.xcassets/AppIcon.appiconset/icon.png', RED_PNG)
    write('build/icon.png', BLUE_PNG)
    expect(await findProjectAppIcon(repo)).toBe(dataUri(BLUE_PNG))
  })

  it('then build/icon.png, resources/icon.*, public/favicon.* in that order', async () => {
    write('public/favicon.png', RED_PNG)
    write('resources/icon.png', BLUE_PNG)
    expect(await findProjectAppIcon(repo)).toBe(dataUri(BLUE_PNG))
  })

  it("falls back to the repo icon probe's conventional files", async () => {
    write('assets/icon.png', RED_PNG)
    expect(await findProjectAppIcon(repo)).toBe(dataUri(RED_PNG))
  })

  it('ignores files that are not PNG or WebP images', async () => {
    write('build/icon.png', 'not an image')
    expect(await findProjectAppIcon(repo)).toBeNull()
  })
})

describe('getProjectAppIcon', () => {
  it('caches per repo, so a later icon shows only after restart', async () => {
    write('build/icon.png', RED_PNG)
    expect(await getProjectAppIcon('repo-cache', repo)).toBe(dataUri(RED_PNG))
    write('build/icon.png', BLUE_PNG)
    expect(await getProjectAppIcon('repo-cache', repo)).toBe(dataUri(RED_PNG))
  })
})
