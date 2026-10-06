import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { NativeChatProofSection } from '../../../../shared/native-chat-proof-card-payload'

/** Swaps text the card cut to fit for its full version, and back. */
export function NativeChatProofExpandToggle({
  expanded,
  onToggle
}: {
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="link"
      size="xs"
      data-proof-expand=""
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {expanded
        ? translate('components.native-chat.proof.showLess', 'Show less')
        : translate('components.native-chat.proof.showMore', 'Show more')}
    </Button>
  )
}

function hiddenLabel(section: NativeChatProofSection, count: number): string {
  switch (section) {
    case 'media':
      return translate('components.native-chat.proof.moreMedia', '{{count}} more media not shown', {
        count
      })
    case 'checks':
      return translate(
        'components.native-chat.proof.moreChecks',
        '{{count}} more checks not shown',
        {
          count
        }
      )
    case 'links':
      return translate('components.native-chat.proof.moreLinks', '{{count}} more links not shown', {
        count
      })
    case 'actions':
      return translate(
        'components.native-chat.proof.moreActions',
        '{{count}} more replies not shown',
        { count }
      )
  }
}

/** Items the card left out of a section: past its maximum, or invalid on their own. */
export function NativeChatProofMoreNote({
  section,
  count
}: {
  section: NativeChatProofSection
  count: number
}): React.JSX.Element | null {
  if (count === 0) {
    return null
  }
  const label = hiddenLabel(section, count)
  return (
    <span
      data-proof-more={section}
      title={label}
      className="text-[11px] leading-4 text-muted-foreground"
    >
      <span aria-hidden>
        {translate('components.native-chat.proof.moreCount', '+{{count}} more', { count })}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
