import { useContext, useEffect, useMemo, useState } from 'react'
import {
  mergeNativeChatSlackNames,
  missingNativeChatSlackNames,
  type NativeChatSlackNamesResult
} from '../../../../src/shared/native-chat-slack-names-contract'
import { MobileNativeChatSlackContext } from './mobile-native-chat-slack-context'

/** Names for the bare `<@U…>` / `<#C…>` mentions in a Slack card's text: the card's
 *  own first, then slack-mcp's cache on the chat's host. Unknown ids stay as ids. */
export function useMobileNativeChatSlackNames(
  text: string,
  known: NativeChatSlackNamesResult
): NativeChatSlackNamesResult {
  const slack = useContext(MobileNativeChatSlackContext)
  const missing = useMemo(() => missingNativeChatSlackNames(text, known), [known, text])
  const [looked, setLooked] = useState<{
    request: typeof missing
    names: NativeChatSlackNamesResult
  } | null>(null)
  useEffect(() => {
    if (!slack || (missing.userIds.length === 0 && missing.channelIds.length === 0)) {
      return
    }
    let live = true
    void slack.loadNames(missing).then((names) => {
      if (live) {
        setLooked({ request: missing, names })
      }
    })
    return () => {
      live = false
    }
  }, [missing, slack])
  return useMemo(
    () => (looked?.request === missing ? mergeNativeChatSlackNames(known, looked.names) : known),
    [known, looked, missing]
  )
}
