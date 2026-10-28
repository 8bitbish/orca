import { defineFixture } from '../../component-fixtures/component-fixture'
import { NativeChatLinkCards } from './NativeChatLinkCards'
import { nativeChatAppearanceStyle } from './native-chat-appearance-style'

// Made-up pages; images are drawn here, standing in for the host's thumbnails.
function picture(width: number, height: number, from: string, to: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, from)
    gradient.addColorStop(1, to)
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
  }
  return canvas.toDataURL('image/png')
}

const PAGES: Record<string, { title: string; description: string; site: string; image?: string }> =
  {
    'https://design.example/articles/navigation-rails': {
      title: 'Navigation rails on large screens: when to use them',
      description: 'A field guide to rails, drawers and bottom bars, with examples from six apps.',
      site: 'Design Notes'
    },
    'https://news.example/2026/10/tablets': {
      title: 'Foldables pass tablets in Q3 shipments',
      description: 'Analysts expect the gap to widen through the holiday quarter.',
      site: 'Example News'
    },
    'https://docs.example/guide/edge-to-edge': {
      title: 'Edge-to-edge layouts',
      description: 'Draw behind the system bars and handle insets correctly.',
      site: 'Example Docs'
    },
    'https://nopreview.example/some/long/path': {
      title: '',
      description: '',
      site: ''
    }
  }

function installPreviews(): void {
  const images = [
    picture(640, 335, '#4f46e5', '#06b6d4'),
    picture(640, 335, '#f97316', '#db2777'),
    picture(640, 335, '#16a34a', '#0ea5e9')
  ]
  Object.keys(PAGES).forEach((url, index) => {
    PAGES[url].image = images[index]
  })
  window.api.nativeChat.linkPreview = async ({ url }) => {
    const page = PAGES[url]
    if (!page || !page.title) {
      return { url }
    }
    return {
      url,
      title: page.title,
      description: page.description,
      site: page.site,
      image: page.image
    }
  }
}

function Frame({ layout }: { layout: 'list' | 'grid' }) {
  const source = JSON.stringify({
    layout,
    items: Object.keys(PAGES).map((url) => ({ url }))
  })
  return (
    <div
      className="native-chat-appearance bg-chat-canvas p-4"
      style={nativeChatAppearanceStyle({})}
    >
      <NativeChatLinkCards source={source} fallback={null} />
    </div>
  )
}

export const list = defineFixture({
  width: 560,
  setup: installPreviews,
  render: () => <Frame layout="list" />
})
export const grid = defineFixture({
  width: 560,
  setup: installPreviews,
  render: () => <Frame layout="grid" />
})
export const phoneGrid = defineFixture({
  width: 380,
  setup: installPreviews,
  render: () => <Frame layout="grid" />
})
