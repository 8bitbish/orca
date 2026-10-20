import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MobileWebBundleManifestSchema,
  type MobileWebBundleManifest
} from '../../src/shared/mobile-web-bundle/manifest-contract'
import { mockProofMediaCapabilities } from './mock-server-proof-media'
import type { RpcRequest, RpcRespond, RpcResponse } from './mock-server-rpc-handlers'
import { handleMockScrollProbeRequest } from './mock-server-scroll-probe'

// Why: the phone draws its screens from the desktop's mobile web bundle (the shell's WebView), so a
// scroll test against the mock host only exercises what Jake's phone runs once the mock serves it.
// `MOCK_MOBILE_WEB_BUNDLE_DIR` names a `pnpm build:mobile-web` output (normally `out/mobile-web`).
const BUNDLE_DIR = process.env.MOCK_MOBILE_WEB_BUNDLE_DIR
const CHUNK_BYTES = 48 * 1024
const RANGE_BYTES = 384 * 1024
const CAPABILITY = 'mobileWeb.bundle.v1'

type Success = (id: string, result: unknown) => RpcResponse

let manifest: MobileWebBundleManifest | null = null

function readManifest(): MobileWebBundleManifest | null {
  if (!BUNDLE_DIR) {
    return null
  }
  manifest ??= MobileWebBundleManifestSchema.parse(
    JSON.parse(readFileSync(join(BUNDLE_DIR, 'manifest.json'), 'utf8'))
  )
  return manifest
}

/** What the mock host's `status.get` advertises. */
export function mockHostCapabilities(): string[] {
  return [
    'accounts.codex-reset-credit.v1',
    ...mockProofMediaCapabilities(),
    ...(readManifest() ? [CAPABILITY] : [])
  ]
}

/** The page's own traffic: its bundle download, and the scroll test's probe reports. */
export function handleMockPageRequest(
  request: RpcRequest,
  respond: RpcRespond,
  success: Success
): boolean {
  return (
    handleMockMobileWebBundleRequest(request, respond, success) ||
    handleMockScrollProbeRequest(request, respond, success)
  )
}

function readWindow(request: RpcRequest, windowBytes: number) {
  const bundle = readManifest()
  const path = request.params?.path
  const asset = bundle?.assets.find((candidate) => candidate.path === path)
  if (!bundle || !asset || !BUNDLE_DIR) {
    return null
  }
  const offset = typeof request.params?.offset === 'number' ? request.params.offset : 0
  const data = readFileSync(join(BUNDLE_DIR, asset.path)).subarray(offset, offset + windowBytes)
  return {
    data,
    header: {
      buildId: bundle.buildId,
      path: asset.path,
      offset,
      assetByteLength: asset.byteLength,
      sha256: asset.sha256,
      eof: offset + data.byteLength >= asset.byteLength
    }
  }
}

function handleMockMobileWebBundleRequest(
  request: RpcRequest,
  respond: RpcRespond,
  success: Success
): boolean {
  if (!readManifest() || !request.method.startsWith('mobileWeb.bundle.')) {
    return false
  }
  if (request.method === 'mobileWeb.bundle.manifest') {
    respond(
      success(request.id, {
        manifest: readManifest(),
        chunkBytes: CHUNK_BYTES,
        rangeBytes: RANGE_BYTES
      })
    )
    return true
  }
  const range = request.method === 'mobileWeb.bundle.range'
  const window = readWindow(request, range ? RANGE_BYTES : CHUNK_BYTES)
  if (!window) {
    return false
  }
  const dataBase64 = window.data.toString('base64')
  respond(
    success(
      request.id,
      range
        ? { ...window.header, encoding: 'identity', dataBase64 }
        : { ...window.header, dataBase64 }
    )
  )
  return true
}
