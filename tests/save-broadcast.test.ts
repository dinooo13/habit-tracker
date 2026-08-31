import { describe, expect, it, vi } from 'vitest'
import { createSaveBroadcast, type BroadcastChannelLike } from '~/utils/persistence/save-broadcast'

function createFakeChannel(): BroadcastChannelLike & { posted: unknown[] } {
  return {
    posted: [] as unknown[],
    onmessage: null,
    postMessage(message: unknown) {
      this.posted.push(message)
    },
    close() {},
  }
}

describe('createSaveBroadcast (#67)', () => {
  it('posts saved messages tagged with the tab id', () => {
    const channel = createFakeChannel()
    const broadcast = createSaveBroadcast({ onSaved: vi.fn(), tabId: 'tab-A', createChannel: () => channel })

    broadcast.post(5)

    expect(channel.posted).toEqual([{ type: 'saved', revision: 5, tabId: 'tab-A' }])
  })

  it('invokes onSaved for a peer message and ignores its own tab id', () => {
    const channel = createFakeChannel()
    const onSaved = vi.fn()
    createSaveBroadcast({ onSaved, tabId: 'tab-A', createChannel: () => channel })

    channel.onmessage?.({ data: { type: 'saved', revision: 9, tabId: 'tab-B' } })
    expect(onSaved).toHaveBeenCalledWith(9)

    channel.onmessage?.({ data: { type: 'saved', revision: 10, tabId: 'tab-A' } })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed messages', () => {
    const channel = createFakeChannel()
    const onSaved = vi.fn()
    createSaveBroadcast({ onSaved, tabId: 'tab-A', createChannel: () => channel })

    channel.onmessage?.({ data: { type: 'other' } })
    channel.onmessage?.({ data: null })
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('is a safe no-op when no channel is available', () => {
    const broadcast = createSaveBroadcast({ onSaved: vi.fn(), createChannel: () => null })
    expect(() => {
      broadcast.post(1)
      broadcast.close()
    }).not.toThrow()
  })
})
