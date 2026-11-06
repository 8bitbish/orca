// The GitHub repo whose releases feed the in-app updater. Personal builds point it
// at the fork, where the personal-build sync publishes each rebuilt release.
export const UPDATER_RELEASE_OWNER = '8bitbish'
export const UPDATER_RELEASE_REPO = `${UPDATER_RELEASE_OWNER}/orca`
export const UPDATER_RELEASES_URL = `https://github.com/${UPDATER_RELEASE_REPO}/releases`
// Every fork build carries a `-local` version, so the fork's latest release counts as stable.
export const UPDATER_FEED_IS_FORK = (UPDATER_RELEASE_OWNER as string) !== 'stablyai'
export const UPDATER_RELEASES_URL_PATTERN = UPDATER_RELEASES_URL.replace(
  /[.*+?^${}()|[\]\\/]/g,
  '\\$&'
)
