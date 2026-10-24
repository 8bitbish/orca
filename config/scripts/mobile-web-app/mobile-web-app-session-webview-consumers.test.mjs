/** Session routes resolve the named components to their web implementations. */
import { describe, expect, it } from 'vitest'
import { mobileWebAppRouteClosure } from '../build-mobile-web-app-bundle.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'

const describeClosure = mobileWebAppDependenciesPresent() ? describe : describe.skip

const SESSION = 'app/h/[hostId]/session/[worktreeId].tsx'

/** Web implementations expected in the session route closure. */
const ANSWERED = [
  'src/components/MobileRichMarkdownEditor.tsx',
  'src/components/MobileHtmlPreview.tsx',
  'src/components/markup-preview/MobileMarkupPreview.web.tsx',
  'src/components/pr-sidebar/MermaidDiagram.tsx',
  'src/terminal/TerminalWebView.web.tsx'
]

describeClosure(
  'the session route web component closure',
  () => {
    it('resolves all five web components, and the two with native siblings without them', async () => {
      const closure = await mobileWebAppRouteClosure(SESSION)
      for (const file of ANSWERED) {
        expect(closure.local, file).toContain(file)
      }
      expect(closure.local).not.toContain('src/terminal/TerminalWebView.tsx')
      expect(closure.local).not.toContain('src/components/markup-preview/MobileMarkupPreview.tsx')
    })
  },
  240_000
)
