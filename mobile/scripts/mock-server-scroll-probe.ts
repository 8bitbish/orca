import { appendFileSync } from 'node:fs'
import type { RpcRequest, RpcRespond, RpcResponse } from './mock-server-rpc-handlers'

// Why: proof-scroll-probe.js reports the page's scroll geometry as `probe.scroll` requests; the
// scroll test reads them back from `MOCK_PROBE_LOG`.
const PROBE_LOG = process.env.MOCK_PROBE_LOG

export function handleMockScrollProbeRequest(
  request: RpcRequest,
  respond: RpcRespond,
  success: (id: string, result: unknown) => RpcResponse
): boolean {
  if (!PROBE_LOG || request.method !== 'probe.scroll') {
    return false
  }
  const sent = request.params?.lines
  const lines = Array.isArray(sent) ? sent.map(String) : []
  if (lines.length > 0) {
    appendFileSync(PROBE_LOG, `${lines.join('\n')}\n`)
  }
  respond(success(request.id, { ok: true }))
  return true
}
