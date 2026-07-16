import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { fetchDemoPayload, hydrateDemoPayload } from '~/composables/use-demo-data'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useCoachStore } from '~/stores/coach'
import { useSettingsStore } from '~/stores/settings'
import { parseAppData } from '~/utils/persistence/storage-schema'

const FIXTURE_PATH = 'tests/fixtures/habit-tracker-6-weeks.json'

// Capture whatever the demo loader persists without touching IndexedDB.
const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn() }))

mockNuxtImport('usePersistence', () => () => ({
  load: vi.fn(),
  save: saveSpy,
  clear: vi.fn(),
}))

function readFixture() {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
}

describe('demo data loader helpers', () => {
  afterEach(() => {
    saveSpy.mockClear()
    useHabitsStore().$reset()
    useEntriesStore().$reset()
    useCoachStore().$reset()
    useSettingsStore().$reset()
  })

  it('fetches and parses demo payload via provided fetch implementation', async () => {
    const fixture = readFixture()
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => fixture,
    }))

    const parsed = await fetchDemoPayload(fetchImpl as unknown as typeof fetch, '/fixtures/demo.json')

    expect(parsed.habits.length).toBeGreaterThan(0)
    expect(parsed.entries.length).toBeGreaterThan(0)
    expect(fetchImpl).toHaveBeenCalledWith('/fixtures/demo.json', { cache: 'no-store' })
  })

  it('throws when fixture request fails', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }))

    await expect(fetchDemoPayload(fetchImpl as unknown as typeof fetch)).rejects.toThrow(/404/)
  })

  it('hydrates the real stores, reconciles, and persists the normalized payload once', async () => {
    const parsed = parseAppData(readFixture())

    const habitsStore = useHabitsStore()
    const entriesStore = useEntriesStore()
    const coachStore = useCoachStore()
    const settingsStore = useSettingsStore()

    await hydrateDemoPayload(parsed)

    // All four stores reflect the fixture.
    expect(habitsStore.habits.length).toBe(parsed.habits.length)
    expect(entriesStore.entries.length).toBeGreaterThanOrEqual(parsed.entries.length)
    expect(coachStore.suggestions.length).toBeGreaterThanOrEqual(parsed.suggestions.length)
    expect(settingsStore.settings).toEqual(parsed.settings)

    // Persisted exactly once with the full normalized snapshot.
    expect(saveSpy).toHaveBeenCalledOnce()
    const persisted = saveSpy.mock.calls[0]![0]
    expect(persisted.habits.length).toBe(parsed.habits.length)
    expect(persisted.entries.length).toBe(entriesStore.entries.length)
    expect(persisted.suggestions.length).toBe(coachStore.suggestions.length)
  })
})
