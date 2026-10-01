import { useEffect, useState } from 'react'
import type { Repo } from '../../../../shared/repo-types'
import { nativeChatProjectAppIconLookupAllowed } from './native-chat-project-icon'

// One lookup per repo per window: every chip and card for a repo shares it.
const lookups = new Map<string, Promise<string | null>>()
const settled = new Map<string, string | null>()

function lookupAppIcon(repoId: string): Promise<string | null> {
  let pending = lookups.get(repoId)
  if (!pending) {
    const getAppIcon = window.api?.repos?.getAppIcon
    pending = (getAppIcon ? getAppIcon({ repoId }) : Promise.resolve(null))
      .catch(() => null)
      .then((src) => {
        settled.set(repoId, src)
        return src
      })
    lookups.set(repoId, pending)
  }
  return pending
}

/** The repo's app icon from the main process; null while unknown, remote or absent. */
export function useNativeChatProjectAppIcon(
  repo: Pick<Repo, 'id' | 'connectionId' | 'executionHostId'> | null
): string | null {
  const repoId = repo && nativeChatProjectAppIconLookupAllowed(repo) ? repo.id : null
  const [loaded, setLoaded] = useState<{ repoId: string; src: string | null } | null>(null)
  useEffect(() => {
    if (repoId === null || settled.has(repoId)) {
      return
    }
    let live = true
    void lookupAppIcon(repoId).then((src) => {
      if (live) {
        setLoaded({ repoId, src })
      }
    })
    return () => {
      live = false
    }
  }, [repoId])
  if (repoId === null) {
    return null
  }
  return settled.get(repoId) ?? (loaded?.repoId === repoId ? loaded.src : null)
}
