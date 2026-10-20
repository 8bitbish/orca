import { createHash } from 'node:crypto'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeMobileWebBundleId,
  MobileWebBundleManifestSchema,
  type MobileWebBundleAsset
} from '../../src/shared/mobile-web-bundle/manifest-contract'

// Why: the scroll test reads the chat's real scroll geometry from inside the page, so it serves a
// copy of the bundle with proof-scroll-probe.js loaded first. The manifest is rewritten the way
// the desktop's build writes it (sorted assets, byte total, content-derived build id), or the
// phone refuses the download.
//
//   npx tsx mobile/scripts/proof-scroll-probe-bundle.ts <bundle dir> <out dir>
const [bundleDir, outDir] = process.argv.slice(2)
if (!bundleDir || !outDir) {
  throw new Error('usage: proof-scroll-probe-bundle.ts <bundle dir> <out dir>')
}
rmSync(outDir, { recursive: true, force: true })
cpSync(bundleDir, outDir, { recursive: true })

const probe = readFileSync(join(import.meta.dirname, 'proof-scroll-probe.js'))
const probePath = `assets/${createHash('sha256').update(probe).digest('hex')}.js`
writeFileSync(join(outDir, probePath), probe)
const htmlPath = join(outDir, 'index.html')
const html = readFileSync(htmlPath, 'utf8')
const entry = html.indexOf('<script type="module"')
if (entry === -1) {
  throw new Error('no module script in index.html')
}
writeFileSync(
  htmlPath,
  `${html.slice(0, entry)}<script src="/${probePath}"></script>${html.slice(entry)}`
)

const manifestPath = join(outDir, 'manifest.json')
const manifest = MobileWebBundleManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
const describe = (path: string, contentType: string): MobileWebBundleAsset => {
  const bytes = readFileSync(join(outDir, path))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return { path, sha256, byteLength: bytes.byteLength, contentType }
}
const typeOf = (match: (path: string) => boolean) =>
  manifest.assets.find((asset) => match(asset.path))?.contentType ?? 'text/javascript'
const assets = [
  ...manifest.assets.filter((asset) => asset.path !== 'index.html'),
  describe(
    'index.html',
    typeOf((path) => path === 'index.html')
  ),
  describe(
    probePath,
    typeOf((path) => path.endsWith('.js'))
  )
].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
const probed = MobileWebBundleManifestSchema.parse({
  ...manifest,
  assets,
  totalBytes: assets.reduce((sum, asset) => sum + asset.byteLength, 0),
  buildId: computeMobileWebBundleId(assets)
})
writeFileSync(manifestPath, JSON.stringify(probed))
console.log(`probe bundle ${probed.buildId} in ${outDir}`)
