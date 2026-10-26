import { readBridgeExternalLinkUrl } from '../mobile-web-shell/bridge/bridge-caps'

// Use shell linking because RN Web window.open reports success even though both native WebViews refuse new windows.
// Publish outside React for plain-function callers; missing publication/invalid URLs log refusal without throwing from tap handlers.
type ExternalLinkOpener = (url: string) => boolean

let post: ExternalLinkOpener = () => false

export function publishExternalLinkOpener(opener: ExternalLinkOpener): void {
  post = opener
}

export function openExternalLink(url: string): void {
  // Validate before posting: the shell drops refused frames without a reply, which would otherwise look like successful navigation.
  if (readBridgeExternalLinkUrl(url) === null) {
    console.warn('[page] refused to open a URL outside the allowed schemes', { url })
    return
  }
  if (!post(url)) {
    console.warn('[page] the shell did not take a URL to open', { url })
  }
}

/** Like `openExternalLink`, but says whether the shell took the URL, so a caller can try a fallback. */
export async function tryOpenExternalLink(url: string): Promise<boolean> {
  if (readBridgeExternalLinkUrl(url) === null || !post(url)) {
    console.warn('[page] the shell did not take a URL to open', { url })
    return false
  }
  return true
}
