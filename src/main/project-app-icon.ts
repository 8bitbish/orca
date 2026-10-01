import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { MAX_REPO_ICON_UPLOAD_BYTES } from '../shared/repo-icon'
import { detectRepoFileIcon, readLocalImageIcon } from './repo-icon-file-detection'

// App-icon locations a chat project card looks in first, before the repo icon
// probe's conventional list. Local repos only: callers check the host.
const APP_ICON_FILES = [
  'build/icon.png',
  'resources/icon.png',
  'resources/icon.webp',
  'public/favicon.png',
  'public/favicon.webp'
] as const

const XCASSETS_MAX_DEPTH = 3
// Why: a bounded walk keeps a monorepo's first card from stalling on its tree.
const XCASSETS_MAX_DIRECTORIES = 400
const XCASSETS_SKIPPED = new Set([
  'node_modules',
  'Pods',
  'DerivedData',
  'build',
  'dist',
  'out',
  'vendor',
  'Carthage'
])

async function findAppIconSets(repoPath: string): Promise<string[]> {
  const found: string[] = []
  let visited = 0
  let frontier = [repoPath]
  for (let depth = 0; depth <= XCASSETS_MAX_DEPTH && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const directory of frontier) {
      if (visited >= XCASSETS_MAX_DIRECTORIES) {
        return found
      }
      visited += 1
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue
        }
        const child = path.join(directory, entry.name)
        if (entry.name.endsWith('.xcassets')) {
          found.push(path.join(child, 'AppIcon.appiconset'))
        } else if (!XCASSETS_SKIPPED.has(entry.name)) {
          next.push(child)
        }
      }
    }
    frontier = next
  }
  return found
}

/** The set's images, largest first, as repo-relative paths. */
async function appIconSetImages(repoPath: string, setPath: string): Promise<string[]> {
  const entries = await readdir(setPath).catch((): string[] => [])
  const images = entries.filter((name) => /\.(png|webp)$/i.test(name))
  const sized = await Promise.all(
    images.map(async (name) => {
      const info = await stat(path.join(setPath, name)).catch(() => null)
      return { name, size: info?.isFile() ? info.size : 0 }
    })
  )
  return sized
    .filter((image) => image.size > 0 && image.size <= MAX_REPO_ICON_UPLOAD_BYTES)
    .sort((left, right) => right.size - left.size)
    .map((image) => path.relative(repoPath, path.join(setPath, image.name)))
}

async function firstReadableIcon(repoPath: string, relativePaths: readonly string[]) {
  for (const relativePath of relativePaths) {
    const icon = await readLocalImageIcon(repoPath, relativePath).catch(() => null)
    if (icon?.type === 'image') {
      return icon.src
    }
  }
  return null
}

/** A data: URI for the repo's app icon, or null when none is found. */
export async function findProjectAppIcon(repoPath: string): Promise<string | null> {
  for (const setPath of await findAppIconSets(repoPath)) {
    // Contents.json marks a real icon set; any image in it is the same artwork.
    const contents = await stat(path.join(setPath, 'Contents.json')).catch(() => null)
    if (!contents?.isFile()) {
      continue
    }
    const src = await firstReadableIcon(repoPath, await appIconSetImages(repoPath, setPath))
    if (src) {
      return src
    }
  }
  const direct = await firstReadableIcon(repoPath, APP_ICON_FILES)
  if (direct) {
    return direct
  }
  const conventional = await detectRepoFileIcon(repoPath, { kind: 'local', hostId: 'local' })
  return conventional?.type === 'image' ? conventional.src : null
}

const cache = new Map<string, Promise<string | null>>()

/** Cached per repo for the life of the process; a new icon shows after restart. */
export function getProjectAppIcon(repoId: string, repoPath: string): Promise<string | null> {
  const key = `${repoId}\0${repoPath}`
  let pending = cache.get(key)
  if (!pending) {
    pending = findProjectAppIcon(repoPath).catch(() => null)
    cache.set(key, pending)
  }
  return pending
}
