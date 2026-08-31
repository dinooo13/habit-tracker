import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APP_DATA_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type AppData,
} from '~/types/app-data'
import { createCrossTabSync, type CrossTabSync, type CrossTabSyncDeps } from '~/composables/use-cross-tab-sync'

function emptyAppData(): AppData {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits: [],
    entries: [],
    suggestions: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

function deps(overrides: Partial<CrossTabSyncDeps> = {}): CrossTabSyncDeps {
  return {
    loadFresh: vi.fn().mockResolvedValue({ data: emptyAppData(), revision: 3 }),
    readRevision: vi.fn().mockResolvedValue(3),
    saveEnvelope: vi.fn(),
    applyRemote: vi.fn(),
    reconcile: vi.fn(),
    snapshot: vi.fn(() => emptyAppData()),
    isDirty: () => false,
    createChannel: () => null,
    logEvent: vi.fn(),
    ...overrides,
  }
}

describe('createCrossTabSync triggers (#67)', () => {
  let sync: CrossTabSync | null = null

  afterEach(() => {
    sync?.stop()
    sync = null
  })

  it('probes the stored revision on start and on a visibilitychange', async () => {
    const readRevision = vi.fn().mockResolvedValue(3)
    const loadFresh = vi.fn()
    sync = createCrossTabSync(deps({ readRevision, loadFresh }))
    sync.prime(emptyAppData(), 3)

    sync.start()
    // Let the initial probe settle.
    await Promise.resolve()
    const afterStart = readRevision.mock.calls.length
    expect(afterStart).toBeGreaterThanOrEqual(1)

    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()

    expect(readRevision.mock.calls.length).toBeGreaterThan(afterStart)
    // Revision unchanged ⇒ no full load.
    expect(loadFresh).not.toHaveBeenCalled()
  })
})
