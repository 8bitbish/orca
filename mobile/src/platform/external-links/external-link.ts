import { Linking } from 'react-native'

// Catch both synchronous Linking validation and rejected open promises; either can fail a tap, and neither may escape its handler. The page sibling forwards through native.
export function openExternalLink(url: string): void {
  try {
    void Linking.openURL(url).catch((error: unknown) => {
      report(url, error)
    })
  } catch (error) {
    // Empty URLs throw before openURL returns a promise, so the promise catch cannot see them.
    report(url, error)
  }
}

// Like openExternalLink, but reports whether the URL opened so a caller can try a fallback.
export async function tryOpenExternalLink(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url)
    return true
  } catch (error) {
    report(url, error)
    return false
  }
}

function report(url: string, error: unknown): void {
  console.warn('[platform] could not open a URL', { url }, error)
}
