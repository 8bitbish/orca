import { describe, expect, it } from 'vitest'
import {
  createMobileNativeChatSizeMemory,
  mobileNativeChatMediaColumnWidth,
  rememberMobileNativeChatMediaColumnWidth
} from './mobile-native-chat-size-memory'

describe('mobile native chat size memory', () => {
  it('keeps the most recently used sizes and drops the oldest', () => {
    const memory = createMobileNativeChatSizeMemory<number>(2)
    memory.set('a', 1)
    memory.set('b', 2)
    expect(memory.get('a')).toBe(1)
    memory.set('a', 3)
    memory.set('c', 4)
    expect(memory.get('b')).toBeUndefined()
    expect([memory.get('a'), memory.get('c')]).toEqual([3, 4])
  })

  it('remembers the last real column width only', () => {
    rememberMobileNativeChatMediaColumnWidth(340)
    rememberMobileNativeChatMediaColumnWidth(0)
    expect(mobileNativeChatMediaColumnWidth()).toBe(340)
  })
})
