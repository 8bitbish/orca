import type { ConnectionState } from '../../transport/types'

// The overlay's personal-build props, for the prompt-controller harness.
export function personalOverlayProps(connState: ConnectionState) {
  return { client: null, hostId: 'host-1', connState }
}
