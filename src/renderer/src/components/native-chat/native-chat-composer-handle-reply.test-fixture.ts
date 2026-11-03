/** The reply-send and queue-restore inputs personal builds add to `useNativeChatComposerHandle`. */
export const composerHandleReplyArgs = {
  targetPtyId: null,
  draft: '',
  sendPty: () => false,
  sendStructured: async () => true,
  structuredTransport: undefined
}
