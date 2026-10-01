import type { AgentHookServer } from '../agent-hooks/server'
import type { TerminalMessageQueueStatusSource } from './terminal-message-queue-host'

type HookStatusStore = Pick<
  AgentHookServer,
  'getStatusSnapshotForPane' | 'subscribeEnrichedStatus' | 'subscribeStatusDrop'
>

/** The queue reads the execution host's own status store, the one every other reader subscribes to. */
export function messageQueueStatusSourceFromHookServer(
  server: HookStatusStore
): TerminalMessageQueueStatusSource {
  return {
    readPaneRows: (paneKey) => server.getStatusSnapshotForPane(paneKey),
    subscribe: (listener) => {
      const stopChanges = server.subscribeEnrichedStatus((row) => listener(row.paneKey))
      const stopDrops = server.subscribeStatusDrop((paneKey) => listener(paneKey))
      return () => {
        stopChanges()
        stopDrops()
      }
    }
  }
}
