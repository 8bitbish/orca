import type { PendingNativeChatImage } from './mobile-native-chat-image-attachment'

// Host image path → this phone's preview URI, for images queued from here. A queued item carries
// only host paths, which the phone cannot render, so its echo and a restore need the local preview.
const MAX_PREVIEWS = 200
const previewsByHostPath = new Map<string, string>()

export function rememberQueuedImagePreviews(images: readonly PendingNativeChatImage[]): void {
  for (const image of images) {
    previewsByHostPath.delete(image.path)
    previewsByHostPath.set(image.path, image.previewUri)
  }
  while (previewsByHostPath.size > MAX_PREVIEWS) {
    const oldest = previewsByHostPath.keys().next().value
    if (oldest === undefined) {
      break
    }
    previewsByHostPath.delete(oldest)
  }
}

/** The images of a queued item this phone can show; images queued elsewhere are left out. */
export function queuedImagesWithPreviews(
  imagePaths: readonly string[] | undefined
): Omit<PendingNativeChatImage, 'id'>[] {
  return (imagePaths ?? []).flatMap((path) => {
    const previewUri = previewsByHostPath.get(path)
    return previewUri ? [{ path, previewUri }] : []
  })
}

export function clearQueuedImagePreviewsForTests(): void {
  previewsByHostPath.clear()
}
