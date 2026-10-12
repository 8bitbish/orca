import { ipcMain, nativeImage, shell, type NativeImage } from 'electron'
import { parseNativeChatSlackHref } from '../../shared/native-chat-slack-href'
import { buildNativeChatSlackLinks } from '../../shared/native-chat-slack-links'
import type { NativeChatSlackImageResult } from '../../shared/native-chat-slack-image-contract'
import {
  readSlackCacheImage,
  setSlackCacheImageCodec,
  SLACK_CACHE_IMAGE_MAX_FILE_BYTES,
  type SlackCacheDecodedImage,
  type SlackCacheImageCodec
} from '../native-chat/slack-cache-image'
import { readSlackCacheNames } from '../native-chat/slack-cache-names'
import {
  EMPTY_NATIVE_CHAT_SLACK_NAMES,
  NATIVE_CHAT_SLACK_NAMES_MAX_IDS,
  type NativeChatSlackNamesResult
} from '../../shared/native-chat-slack-names-contract'
import {
  isNativeChatSlackConversationId,
  isNativeChatSlackUserId
} from '../../shared/native-chat-slack-ids'

function decodedNativeImage(image: NativeImage): SlackCacheDecodedImage {
  const { width, height } = image.getSize()
  return {
    width,
    height,
    resizeToWidth: (target) => {
      const resized = target >= width ? image : image.resize({ width: target, quality: 'good' })
      return { png: () => resized.toPNG(), jpeg: (quality) => resized.toJPEG(quality) }
    },
    crop: (rect) =>
      rect.x === 0 && rect.y === 0 && rect.width >= width && rect.height >= height
        ? decodedNativeImage(image)
        : decodedNativeImage(image.crop(rect))
  }
}

const electronImageCodec: SlackCacheImageCodec = {
  decode: (bytes) => {
    const image = nativeImage.createFromBuffer(bytes)
    return image.isEmpty() ? null : decodedNativeImage(image)
  }
}

function idList(value: unknown, isId: (id: unknown) => id is string): string[] | null {
  return Array.isArray(value) &&
    value.length <= NATIVE_CHAT_SLACK_NAMES_MAX_IDS &&
    value.every(isId)
    ? value
    : null
}

async function openFirst(urls: readonly string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await shell.openExternal(url)
      return true
    } catch {
      // No app registered for this link; try the next one.
    }
  }
  return false
}

// Desktop side of Slack chips and cards: images and mention names from this machine's
// slack-mcp cache, and opening a chip in Slack. Both take only validated, bounded inputs.
export function registerNativeChatSlackHandlers(): void {
  setSlackCacheImageCodec(electronImageCodec)
  ipcMain.handle(
    'nativeChat:slackImage',
    async (_event, args: unknown): Promise<NativeChatSlackImageResult | null> => {
      const request = typeof args === 'object' && args !== null ? args : {}
      const path = 'path' in request ? request.path : undefined
      const variant = 'variant' in request ? request.variant : undefined
      if (typeof path !== 'string' || (variant !== 'thumbnail' && variant !== 'full')) {
        return null
      }
      const read = await readSlackCacheImage({
        path,
        variant,
        maxBytes: SLACK_CACHE_IMAGE_MAX_FILE_BYTES
      })
      return read.ok ? read.image : null
    }
  )
  ipcMain.handle(
    'nativeChat:slackNames',
    async (_event, args: unknown): Promise<NativeChatSlackNamesResult> => {
      const request = typeof args === 'object' && args !== null ? args : {}
      const userIds = idList(
        'userIds' in request ? request.userIds : undefined,
        isNativeChatSlackUserId
      )
      const channelIds = idList(
        'channelIds' in request ? request.channelIds : undefined,
        isNativeChatSlackConversationId
      )
      return userIds && channelIds
        ? readSlackCacheNames({ userIds, channelIds })
        : EMPTY_NATIVE_CHAT_SLACK_NAMES
    }
  )
  // Takes a chip href, never a URL, so the renderer cannot open anything but Slack.
  ipcMain.handle('nativeChat:openSlack', async (_event, href: unknown): Promise<boolean> => {
    const target = parseNativeChatSlackHref(typeof href === 'string' ? href : undefined)
    if (!target) {
      return false
    }
    const { primary, fallback } = buildNativeChatSlackLinks(target)
    return openFirst(fallback === null ? [primary] : [primary, fallback])
  })
}
