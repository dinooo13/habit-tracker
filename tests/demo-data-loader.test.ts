import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { fetchDemoPayload, hydrateDemoPayload } from '~/composables/use-demo-data'
import { createEmptyAppData, parseAppData } from '~/utils/storage-schema'

const FIXTURE_PATH = 'tests/fixtures/habit-tracker-6-weeks.json'

function readFixture() {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
}

describe('demo data loader helpers', () => {
  it('fetches and parses demo payload via provided fetch implementation', async () => {
    const fixture = readFixture()
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => fixture
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
      json: async () => ({})
    }))

    await expect(fetchDemoPayload(fetchImpl as unknown as typeof fetch)).rejects.toThrow(/404/)
  })

  it('hydrates stores and persists normalized payload', async () => {
    const parsed = parseAppData(readFixture())
    const state = createEmptyAppData()

    const habitsStore = {
      get activeHabits() {
        return state.habits.filter((habit) => !habit.archived)
      },
      hydrate: vi.fn((value) => {
        state.habits = value
      }),
      snapshot: vi.fn(() => state.habits)
    }

    const entriesStore = {
      entries: state.entries,
      hydrate: vi.fn((value) => {
        state.entries = value
        entriesStore.entries = value
      }),
      snapshot: vi.fn(() => state.entries),
      ensureMissedEntries: vi.fn()
    }

    const coachStore = {
      suggestions: state.suggestions,
      hydrate: vi.fn((value) => {
        state.suggestions = value
        coachStore.suggestions = value
      }),
      snapshot: vi.fn(() => state.suggestions),
      reconcileMissingSuggestions: vi.fn()
    }

    const settingsStore = {
      primaryColor: state.settings.primaryColor,
      hydrate: vi.fn((value) => {
        state.settings = value
        settingsStore.primaryColor = value.primaryColor
      }),
      snapshot: vi.fn(() => state.settings)
    }

    const persistence = {
      save: vi.fn()
    }

    await hydrateDemoPayload(parsed, {
      habitsStore: habitsStore as any,
      entriesStore: entriesStore as any,
      coachStore: coachStore as any,
      settingsStore: settingsStore as any,
      persistence: persistence as any
    })

    expect(habitsStore.hydrate).toHaveBeenCalledOnce()
    expect(entriesStore.hydrate).toHaveBeenCalledOnce()
    expect(coachStore.hydrate).toHaveBeenCalledOnce()
    expect(settingsStore.hydrate).toHaveBeenCalledOnce()
    expect(entriesStore.ensureMissedEntries).toHaveBeenCalledOnce()
    expect(coachStore.reconcileMissingSuggestions).toHaveBeenCalledOnce()

    expect(persistence.save).toHaveBeenCalledOnce()
    expect((persistence.save as any).mock.calls[0][0].habits.length).toBe(parsed.habits.length)
    expect((persistence.save as any).mock.calls[0][0].entries.length).toBeGreaterThan(0)
  })
})
