import { createId } from '~/utils/domain/id'

/**
 * Same-origin cross-tab "a save landed" signal over `BroadcastChannel`
 * (issue #67, ADR-0024). Best-effort and dependency-free: when the platform has
 * no `BroadcastChannel` the factory returns a no-op and the freshness poll in
 * `useCrossTabSync` covers the gap — the app keeps no app data in `localStorage`,
 * so there is deliberately no `storage`-event fallback.
 */

export const SAVE_BROADCAST_CHANNEL = 'habit-tracker:persistence'

export interface SaveBroadcastMessage {
  type: 'saved'
  revision: number
  tabId: string
}

/** The slice of `BroadcastChannel` we use, so tests can inject a fake. */
export interface BroadcastChannelLike {
  postMessage: (message: unknown) => void
  close: () => void
  onmessage: ((event: { data: unknown }) => void) | null
}

export interface SaveBroadcast {
  /** Announce a successful write at `revision` to the other tabs. */
  post: (revision: number) => void
  /** Tear down the channel subscription. */
  close: () => void
}

export interface CreateSaveBroadcastDeps {
  /** Invoked with a peer tab's revision (never this tab's own posts). */
  onSaved: (revision: number) => void
  /** This tab's identity, for self-filtering. Defaults to a fresh id. */
  tabId?: string
  /** Channel factory seam; defaults to a real `BroadcastChannel` when available, else `null`. */
  createChannel?: () => BroadcastChannelLike | null
}

function defaultCreateChannel(): BroadcastChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null
  }
  return new BroadcastChannel(SAVE_BROADCAST_CHANNEL) as unknown as BroadcastChannelLike
}

function isSaveMessage(data: unknown): data is SaveBroadcastMessage {
  return (
    typeof data === 'object'
    && data !== null
    && (data as { type?: unknown }).type === 'saved'
    && typeof (data as { revision?: unknown }).revision === 'number'
    && typeof (data as { tabId?: unknown }).tabId === 'string'
  )
}

export function createSaveBroadcast(deps: CreateSaveBroadcastDeps): SaveBroadcast {
  const tabId = deps.tabId ?? createId('tab')
  const createChannel = deps.createChannel ?? defaultCreateChannel
  const channel = createChannel()

  if (channel) {
    channel.onmessage = (event) => {
      if (isSaveMessage(event.data) && event.data.tabId !== tabId) {
        deps.onSaved(event.data.revision)
      }
    }
  }

  return {
    post(revision: number): void {
      if (!channel) {
        return
      }
      const message: SaveBroadcastMessage = { type: 'saved', revision, tabId }
      channel.postMessage(message)
    },
    close(): void {
      if (channel) {
        channel.onmessage = null
        channel.close()
      }
    },
  }
}
