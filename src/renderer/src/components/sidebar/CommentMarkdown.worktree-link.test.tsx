// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import CommentMarkdown from './CommentMarkdown'

afterEach(cleanup)

const LINK = 'See [orca-personal](orca-worktree:orca-personal/personal) now.'

function chip({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <span data-testid="chip" data-href={href}>
      {children}
    </span>
  )
}

describe('CommentMarkdown orca-worktree links', () => {
  it('keeps the scheme and hands the link to the chat renderer that asked for it', () => {
    render(<CommentMarkdown content={LINK} variant="document" renderWorktreeLink={chip} />)
    expect(screen.getByTestId('chip')).toHaveAttribute(
      'data-href',
      'orca-worktree:orca-personal/personal'
    )
    expect(screen.getByTestId('chip')).toHaveTextContent('orca-personal')
  })

  it('strips the scheme on every surface that does not draw chips', () => {
    for (const variant of ['document', 'compact'] as const) {
      const { container, unmount } = render(<CommentMarkdown content={LINK} variant={variant} />)
      const anchor = container.querySelector('a')
      expect(anchor).not.toBeNull()
      expect(anchor).not.toHaveAttribute('href')
      expect(anchor).toHaveTextContent('orca-personal')
      unmount()
    }
  })

  it('does not let the chat renderer widen any other scheme', () => {
    const { container } = render(
      <CommentMarkdown
        content="[x](javascript:alert(1)) [y](orca-other:z)"
        variant="document"
        renderWorktreeLink={chip}
      />
    )
    expect(screen.queryByTestId('chip')).toBeNull()
    for (const anchor of container.querySelectorAll('a')) {
      expect(anchor).not.toHaveAttribute('href')
    }
  })
})
