// Why: `nativeChat.proofMedia*` is new; a phone probes this before fetching a proof card's media,
// and a host without it leaves the card showing a "media unavailable" placeholder, never an error.
export const NATIVE_CHAT_PROOF_MEDIA_RUNTIME_CAPABILITY = 'native-chat.proof-media.v1' as const

export const NATIVE_CHAT_PROOF_MEDIA_MOBILE_METHODS = [
  'nativeChat.proofMediaInfo',
  'nativeChat.proofMediaRead',
  'nativeChat.proofMediaThumbnail'
] as const
