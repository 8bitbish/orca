import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const writeText = vi.fn(async (_value: string) => {})

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('../platform/clipboard', () => ({ useClipboardWriter: () => ({ writeText }) }))

let renderer: ReactTestRenderer | null = null

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('MobileNativeChatProseCopy on Android', () => {
  it('turns transcript selection off and copies a message on long-press', async () => {
    const { MobileNativeChatProseCopy, NATIVE_CHAT_TEXT_SELECTABLE } =
      await import('./MobileNativeChatProseCopy')
    expect(NATIVE_CHAT_TEXT_SELECTABLE).toBe(false)
    act(() => {
      renderer = create(
        <MobileNativeChatProseCopy text="hello there">child</MobileNativeChatProseCopy>
      )
    })
    const pressable = renderer!.root.findByProps({ delayLongPress: 450 })
    // A tap or a drag does nothing; only a long-press copies.
    expect(pressable.props.onPress).toBeUndefined()
    await act(async () => pressable.props.onLongPress())
    expect(writeText).toHaveBeenCalledWith('hello there')
    expect(
      renderer!.root
        .findAll((node) => String(node.type) === 'Text')
        .map((node) => node.props.children)
    ).toContain('Copied')
  })
})
