import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData } from '~/types/app-data'
import { APP_DATA_SCHEMA_VERSION, DEFAULT_SETTINGS } from '~/types/app-data'
import { createPersistenceSaver, loadAppDataSafely } from '~/utils/persistence/persistence-saver'

function appData(overrides: Partial<AppData> = {}): AppData {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits: [],
    entries: [],
    suggestions: [],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  }
}

function makeDeps(save: (payload: AppData) => Promise<void>, overrides: Partial<Parameters<typeof createPersistenceSaver>[0]> = {}) {
  return {
    save,
    markSaving: vi.fn(),
    markSaved: vi.fn(),
    reportWriteFailure: vi.fn(),
    markUnavailable: vi.fn(),
    // Deterministic, tiny delays so fake timers advance predictably.
    delayFor: (attempt: number) => (attempt + 1) * 10,
    ...overrides,
  }
}

describe('createPersistenceSaver (#65)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks saved on a first-try success (no retry)', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps(save)
    const saver = createPersistenceSaver(deps)

    saver.save(appData())
    await vi.runAllTimersAsync()

    expect(save).toHaveBeenCalledTimes(1)
    expect(deps.markSaving).toHaveBeenCalled()
    expect(deps.markSaved).toHaveBeenCalledTimes(1)
    expect(deps.markUnavailable).not.toHaveBeenCalled()
  })

  it('retries after failures and eventually succeeds', async () => {
    // Reject twice, then resolve → 3 total save() calls, final status ok.
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('locked'))
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValueOnce(undefined)
    const deps = makeDeps(save)
    const saver = createPersistenceSaver(deps)

    saver.save(appData())
    await vi.runAllTimersAsync()

    expect(save).toHaveBeenCalledTimes(3)
    expect(deps.reportWriteFailure).toHaveBeenCalledTimes(2)
    expect(deps.markSaved).toHaveBeenCalledTimes(1)
    expect(deps.markUnavailable).not.toHaveBeenCalled()
  })

  it('gives up as unavailable once retries are exhausted', async () => {
    const save = vi.fn().mockRejectedValue(new Error('locked'))
    const deps = makeDeps(save, { maxRetries: 3 })
    const saver = createPersistenceSaver(deps)

    saver.save(appData())
    await vi.runAllTimersAsync()

    // 1 initial attempt + 3 retries = 4 save() calls.
    expect(save).toHaveBeenCalledTimes(4)
    expect(deps.markUnavailable).toHaveBeenCalledWith('retries-exhausted')
    expect(deps.markSaved).not.toHaveBeenCalled()
  })

  it('short-circuits a quota error straight to unavailable with no retry', async () => {
    const save = vi.fn().mockRejectedValue(new DOMException('full', 'QuotaExceededError'))
    const deps = makeDeps(save)
    const saver = createPersistenceSaver(deps)

    saver.save(appData())
    await vi.runAllTimersAsync()

    expect(save).toHaveBeenCalledTimes(1)
    expect(deps.markUnavailable).toHaveBeenCalledWith('quota')
  })

  it('supersedes an in-progress retry with the latest snapshot and resets attempts', async () => {
    const first = appData({ habits: [] })
    const second = appData({ entries: [] })
    // First payload always fails; once superseded, the second payload succeeds.
    const save = vi.fn((payload: AppData) =>
      payload === second ? Promise.resolve() : Promise.reject(new Error('locked')),
    )
    const deps = makeDeps(save)
    const saver = createPersistenceSaver(deps)

    saver.save(first)
    // Let the first attempt fail and schedule a retry.
    await vi.advanceTimersByTimeAsync(5)
    // A new edit arrives before the retry fires.
    saver.save(second)
    await vi.runAllTimersAsync()

    expect(deps.markSaved).toHaveBeenCalledTimes(1)
    // The stale first-payload retry must not resurrect after the supersede.
    expect(save).toHaveBeenLastCalledWith(second)
    expect(deps.markUnavailable).not.toHaveBeenCalled()
  })
})

describe('loadAppDataSafely (#65)', () => {
  it('returns the loaded data on success without marking unavailable', async () => {
    const onUnavailable = vi.fn()
    const loaded = appData({ suggestions: [] })
    const result = await loadAppDataSafely(() => Promise.resolve(loaded), onUnavailable, () => appData())

    expect(result).toBe(loaded)
    expect(onUnavailable).not.toHaveBeenCalled()
  })

  it('falls back to empty state and marks unavailable when the load throws', async () => {
    const onUnavailable = vi.fn()
    const fallback = appData()
    const result = await loadAppDataSafely(
      () => Promise.reject(new Error('db blocked')),
      onUnavailable,
      () => fallback,
    )

    expect(result).toBe(fallback)
    expect(onUnavailable).toHaveBeenCalledWith('load-failed')
  })
})
