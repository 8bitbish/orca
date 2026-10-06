// Why: `nativeChat.proofMedia*` is new; a phone probes this before fetching a proof card's media,
// and a host without it leaves the card showing a "media unavailable" placeholder, never an error.
export const NATIVE_CHAT_PROOF_MEDIA_RUNTIME_CAPABILITY = 'native-chat.proof-media.v1' as const

export const NATIVE_CHAT_PROOF_MEDIA_MOBILE_METHODS = [
  'nativeChat.proofMediaInfo',
  'nativeChat.proofMediaRead',
  'nativeChat.proofMediaThumbnail'
] as const

// Why: a phone zooming a large proof image asks for one rectangle at a time; a host without
// this keeps serving the whole file through proofMediaRead, as before.
export const NATIVE_CHAT_PROOF_IMAGE_REGION_RUNTIME_CAPABILITY =
  'native-chat.proof-image-region.v1' as const

export const NATIVE_CHAT_PROOF_IMAGE_REGION_MOBILE_METHODS = [
  'nativeChat.proofImageRegion'
] as const

/** Every proof-card capability a host advertises. */
export const NATIVE_CHAT_PROOF_RUNTIME_CAPABILITIES = [
  NATIVE_CHAT_PROOF_MEDIA_RUNTIME_CAPABILITY,
  NATIVE_CHAT_PROOF_IMAGE_REGION_RUNTIME_CAPABILITY
] as const
