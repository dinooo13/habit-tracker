import { describe, expect, it, vi } from 'vitest'
import {
  APP_DATA_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type AppData,
  type Habit,
} from '~/types/app-data'
import { createCrossTabSync, type CrossTabSyncDeps } from '~/composables/use-cross-tab-sync'
import { AppDataConflictError } from '~/utils/persistence/merge-app-data'
import { StaleWriteError } from '~/utils/persistence/persistence-adapter'

function habit(id: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    name: `Habit ${id}`,
    type: 'build',
    identityStatement: 'I am consistent.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-08-01',
    archived: false,
    pauses: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function appData(habits: Habit[]): AppData {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits,
    entries: [],
    suggestions: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

function baseDeps(overrides: Partial<CrossTabSyncDeps> = {}): CrossTabSyncDeps {
  return {
    loadFresh: vi.fn(),
    readRevision: vi.fn(),
    saveEnvelope: vi.fn(),
    applyRemote: vi.fn(),
    reconcile: vi.fn(),
    snapshot: vi.fn(),
    isDirty: () => false,
    createChannel: () => null,
    logEvent: vi.fn(),
    ...overrides,
  }
}

describe('createCrossTabSync (#67)', () => {
  describe('checkFreshness', () => {
    it('applies a peer write when the tab is clean and stored moved ahead', async () => {
      const fresh = appData([habit('h1', { name: 'From peer' })])
      const applyRemote = vi.fn()
      const deps = baseDeps({
        readRevision: vi.fn().mockResolvedValue(8),
        loadFresh: vi.fn().mockResolvedValue({ data: fresh, revision: 8 }),
        applyRemote,
        isDirty: () => false,
      })
      const sync = createCrossTabSync(deps)
      sync.prime(appData([habit('h1')]), 5)

      await sync.checkFreshness()

      expect(applyRemote).toHaveBeenCalledWith(fresh)
      expect(sync.currentRevision()).toBe(8)
      expect(sync.lastRemoteAppliedAt.value).not.toBeNull()
    })

    it('defers to the guard on a dirty tab (never re-hydrates)', async () => {
      const loadFresh = vi.fn()
      const applyRemote = vi.fn()
      const deps = baseDeps({
        readRevision: vi.fn().mockResolvedValue(8),
        loadFresh,
        applyRemote,
        isDirty: () => true,
      })
      const sync = createCrossTabSync(deps)
      sync.prime(appData([habit('h1')]), 5)

      await sync.checkFreshness()

      expect(loadFresh).not.toHaveBeenCalled()
      expect(applyRemote).not.toHaveBeenCalled()
      expect(sync.currentRevision()).toBe(5)
    })

    it('is inert while a conflict is unresolved', async () => {
      const readRevision = vi.fn().mockResolvedValue(9)
      const sync = createCrossTabSync(baseDeps({ readRevision }))
      sync.conflict.value = []
      await sync.checkFreshness()
      expect(readRevision).not.toHaveBeenCalled()
    })
  })

  describe('saveGuarded', () => {
    it('merges a stale save and re-saves at the new revision', async () => {
      let stored = 6
      const merged: AppData[] = []
      const saveEnvelope = vi.fn(async (_payload: AppData, expected: number | null) => {
        if (expected !== null && expected !== stored) {
          throw new StaleWriteError(expected, stored)
        }
        stored += 1
        return stored
      })
      const base = appData([habit('h1'), habit('h2')])
      const ours = appData([habit('h1', { name: 'Ours' }), habit('h2')])
      const theirs = appData([habit('h1'), habit('h2', { name: 'Theirs' })])
      const logEvent = vi.fn()

      const deps = baseDeps({
        saveEnvelope,
        loadFresh: vi.fn().mockResolvedValue({ data: theirs, revision: 6 }),
        applyRemote: vi.fn((data: AppData) => merged.push(data)),
        snapshot: vi.fn(() => merged[merged.length - 1]!),
        logEvent,
      })
      const sync = createCrossTabSync(deps)
      sync.prime(base, 5)

      await sync.saveGuarded(ours)

      expect(saveEnvelope).toHaveBeenCalledTimes(2)
      // Second save uses the freshly-observed revision (6) and the merged payload.
      expect(saveEnvelope.mock.calls[1]![1]).toBe(6)
      const savedMerged = saveEnvelope.mock.calls[1]![0]
      const byId = new Map(savedMerged.habits.map(h => [h.id, h.name]))
      expect(byId.get('h1')).toBe('Ours')
      expect(byId.get('h2')).toBe('Theirs')
      expect(sync.conflict.value).toBeNull()
      expect(logEvent).toHaveBeenCalledWith('storage.conflict_merged', 'info', expect.any(String))
    })

    it('enters conflict state on a real collision and stops', async () => {
      const saveEnvelope = vi.fn(async (_p: AppData, expected: number | null) => {
        throw new StaleWriteError(expected ?? 0, 6)
      })
      const base = appData([habit('h1')])
      const ours = appData([habit('h1', { name: 'A' })])
      const theirs = appData([habit('h1', { name: 'B' })])
      const applyRemote = vi.fn()
      const logEvent = vi.fn()

      const deps = baseDeps({
        saveEnvelope,
        loadFresh: vi.fn().mockResolvedValue({ data: theirs, revision: 6 }),
        applyRemote,
        logEvent,
      })
      const sync = createCrossTabSync(deps)
      sync.prime(base, 5)

      await expect(sync.saveGuarded(ours)).rejects.toBeInstanceOf(AppDataConflictError)
      expect(saveEnvelope).toHaveBeenCalledTimes(1)
      expect(applyRemote).not.toHaveBeenCalled()
      expect(sync.conflict.value).not.toBeNull()
      expect(logEvent).toHaveBeenCalledWith('storage.conflict_detected', 'warn', expect.any(String))
    })

    it('bounds the re-merge loop at 3 attempts then surfaces a conflict', async () => {
      // Always stale, but the merge always succeeds (disjoint) — a livelock.
      const saveEnvelope = vi.fn(async (_p: AppData, expected: number | null) => {
        throw new StaleWriteError(expected ?? 0, (expected ?? 0) + 1)
      })
      const base = appData([habit('h1'), habit('h2')])
      const ours = appData([habit('h1', { name: 'Ours' }), habit('h2')])
      const theirs = appData([habit('h1'), habit('h2', { name: 'Theirs' })])
      const applied: AppData[] = []

      const deps = baseDeps({
        saveEnvelope,
        loadFresh: vi.fn().mockResolvedValue({ data: theirs, revision: 6 }),
        applyRemote: vi.fn((data: AppData) => applied.push(data)),
        snapshot: vi.fn(() => applied[applied.length - 1] ?? ours),
      })
      const sync = createCrossTabSync(deps)
      sync.prime(base, 5)

      const error = await sync.saveGuarded(ours).catch(e => e)
      expect(error).toBeInstanceOf(AppDataConflictError)
      expect((error as AppDataConflictError).conflicts).toEqual([])
      expect(saveEnvelope).toHaveBeenCalledTimes(3)
      expect(sync.conflict.value).toEqual([])
    })

    it('rethrows a genuine storage error untouched (not a stale write)', async () => {
      const saveEnvelope = vi.fn().mockRejectedValue(new Error('disk on fire'))
      const sync = createCrossTabSync(baseDeps({ saveEnvelope }))
      sync.prime(appData([]), 0)

      await expect(sync.saveGuarded(appData([]))).rejects.toThrow('disk on fire')
      expect(sync.conflict.value).toBeNull()
    })

    it('keeps the merge ancestor independent of an in-place edit to its source object (#67)', async () => {
      // The four Pinia stores hydrate() by sharing the incoming record objects
      // (a shallow array copy), so the object handed to prime() is the very one a
      // later edit mutates in place. If the ancestor is not an independent copy it
      // collapses to equal `ours`, and a genuine same-record collision is silently
      // merged away instead of prompting — the exact regression this guards.
      const shared = habit('h1', { name: 'Focus block' })
      const priming = appData([shared])

      const theirs = appData([habit('h1', { name: 'A version', updatedAt: '2026-08-02T00:00:00.000Z' })])
      const deps = baseDeps({
        saveEnvelope: vi.fn(async (_p: AppData, expected: number | null) => {
          throw new StaleWriteError(expected ?? 0, 1)
        }),
        loadFresh: vi.fn().mockResolvedValue({ data: theirs, revision: 1 }),
      })
      const sync = createCrossTabSync(deps)
      sync.prime(priming, 0)

      // Simulate the store's in-place edit on the SHARED habit after priming.
      shared.name = 'B version'
      shared.updatedAt = '2026-08-03T00:00:00.000Z'

      // `ours` carries that same edit; `theirs` changed the same habit differently.
      const ours = appData([habit('h1', { name: 'B version', updatedAt: '2026-08-03T00:00:00.000Z' })])

      await expect(sync.saveGuarded(ours)).rejects.toBeInstanceOf(AppDataConflictError)
      expect(sync.conflict.value).not.toBeNull()
    })
  })

  describe('saveAuthoritative', () => {
    it('force-writes and adopts the returned revision', async () => {
      const saveEnvelope = vi.fn().mockResolvedValue(42)
      const sync = createCrossTabSync(baseDeps({ saveEnvelope }))
      sync.prime(appData([]), 5)

      const revision = await sync.saveAuthoritative(appData([habit('h1')]))

      expect(saveEnvelope).toHaveBeenCalledWith(expect.anything(), null)
      expect(revision).toBe(42)
      expect(sync.currentRevision()).toBe(42)
    })
  })

  describe('saveFinal', () => {
    it('returns false on a stale write without throwing', async () => {
      const saveEnvelope = vi.fn(async () => {
        throw new StaleWriteError(5, 6)
      })
      const sync = createCrossTabSync(baseDeps({ saveEnvelope }))
      sync.prime(appData([]), 5)

      await expect(sync.saveFinal(appData([]))).resolves.toBe(false)
    })
  })
})
