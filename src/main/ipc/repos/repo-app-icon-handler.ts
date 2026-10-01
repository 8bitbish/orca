import { ipcMain } from 'electron'
import type { Store } from '../../persistence'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { getProjectAppIcon } from '../../project-app-icon'

export function registerRepoAppIconHandler(store: Store): void {
  ipcMain.handle('repos:getAppIcon', async (_event, args: { repoId?: unknown }) => {
    const repo = typeof args?.repoId === 'string' ? store.getRepo(args.repoId) : undefined
    // Why: a remote repo's files are on its host; a same-named local path is another project.
    if (!repo || repo.connectionId || getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
      return null
    }
    return getProjectAppIcon(repo.id, repo.path)
  })
}
