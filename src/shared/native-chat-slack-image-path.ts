// Slack card images are files slack-mcp downloaded into its cache folder on the
// host. A card names one by a path relative to that folder; an absolute path is
// accepted only when it visibly sits in the folder, and is cut down to the relative
// part, so only the relative path ever travels to the host. The host still resolves
// it with realpath and refuses anything that lands outside the folder.

/** The cache folder under the host user's home directory. */
export const SLACK_MCP_IMAGE_CACHE_HOME_RELATIVE = ['Library', 'Caches', 'slack-mcp', 'files']

export const NATIVE_CHAT_SLACK_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

const CACHE_MARKER = `/${SLACK_MCP_IMAGE_CACHE_HOME_RELATIVE.join('/')}/`
const MAX_PATH_LENGTH = 512
const MAX_SEGMENTS = 8
const SEGMENT = /^[^/\\\0]{1,200}$/

export function hasNativeChatSlackImageExtension(path: string): boolean {
  const dot = path.lastIndexOf('.')
  return (
    dot !== -1 && NATIVE_CHAT_SLACK_IMAGE_EXTENSIONS.includes(path.slice(dot + 1).toLowerCase())
  )
}

/** The cache-relative path a card's `path` names, or null when it is not one. */
export function normalizeNativeChatSlackImagePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATH_LENGTH) {
    return null
  }
  let relative = value
  if (value.startsWith('/') || value.startsWith('~/')) {
    const at = value.indexOf(CACHE_MARKER)
    if (at === -1) {
      return null
    }
    relative = value.slice(at + CACHE_MARKER.length)
  }
  const segments = relative.split('/')
  if (
    segments.length > MAX_SEGMENTS ||
    segments.some((segment) => !SEGMENT.test(segment) || segment === '.' || segment === '..') ||
    !hasNativeChatSlackImageExtension(relative)
  ) {
    return null
  }
  return relative
}
