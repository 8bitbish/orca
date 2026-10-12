import { useEffect, useMemo, useState } from 'react'
import {
  mergeNativeChatSlackNames,
  missingNativeChatSlackNames,
  parseNativeChatSlackNamesResult,
  type NativeChatSlackNamesRequest,
  type NativeChatSlackNamesResult
} from '../../../../shared/native-chat-slack-names-contract'

// Names already looked up this session, so a remounted card paints them at once.
const lookedUp: NativeChatSlackNamesResult = { users: {}, channels: {} }

function fromLookedUp(ids: NativeChatSlackNamesRequest): NativeChatSlackNamesResult {
  const pick = (table: Record<string, string>, list: string[]): Record<string, string> =>
    Object.fromEntries(list.flatMap((id) => (table[id] === undefined ? [] : [[id, table[id]]])))
  return {
    users: pick(lookedUp.users, ids.userIds),
    channels: pick(lookedUp.channels, ids.channelIds)
  }
}

/** Names for the bare `<@U…>` / `<#C…>` mentions in a Slack card's text: the card's
 *  own first, then slack-mcp's cache on the chat's host. Unknown ids stay as ids. */
export function useNativeChatSlackNames(
  text: string,
  known: NativeChatSlackNamesResult
): NativeChatSlackNamesResult {
  const missing = useMemo(() => missingNativeChatSlackNames(text, known), [known, text])
  // Bumped when a lookup lands, to re-read `lookedUp`.
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const pending = {
      userIds: missing.userIds.filter((id) => lookedUp.users[id] === undefined),
      channelIds: missing.channelIds.filter((id) => lookedUp.channels[id] === undefined)
    }
    if (pending.userIds.length === 0 && pending.channelIds.length === 0) {
      return
    }
    let live = true
    let request: Promise<unknown>
    try {
      request = window.api.nativeChat.slackNames(pending)
    } catch {
      request = Promise.resolve(null)
    }
    request.then(
      (reply) => {
        const names = parseNativeChatSlackNamesResult(reply)
        if (names) {
          Object.assign(lookedUp.users, names.users)
          Object.assign(lookedUp.channels, names.channels)
          if (live) {
            setRevision((value) => value + 1)
          }
        }
      },
      // An old host or a failed call leaves the ids showing.
      () => {}
    )
    return () => {
      live = false
    }
  }, [missing])
  return useMemo(
    () => mergeNativeChatSlackNames(known, fromLookedUp(missing)),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- revision marks `lookedUp` changing.
    [known, missing, revision]
  )
}
