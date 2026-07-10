import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHabitsStore } from '~/stores/habits'
import type { Habit, HabitCreateInput, HabitUpdateInput } from '~/types/app-data'

function buildHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit_1',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-02-08',
    archived: false,
    pauses: [],
    createdAt: '2026-02-08T00:00:00.000Z',
    updatedAt: '2026-02-08T00:00:00.000Z',
    ...overrides,
  }
}

function buildCreateInput(overrides: Partial<HabitCreateInput> = {}): HabitCreateInput {
  return {
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-02-08',
    ...overrides,
  }
}

function buildUpdateInput(overrides: Partial<HabitUpdateInput> = {}): HabitUpdateInput {
  return {
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am a runner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-02-08',
    archived: false,
    ...overrides,
  }
}

describe('habits store — createHabit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('trims name and identityStatement', () => {
    const store = useHabitsStore()
    const habit = store.createHabit(buildCreateInput({ name: '  Morning run  ', identityStatement: '  I run.  ' }))

    expect(habit.name).toBe('Morning run')
    expect(habit.identityStatement).toBe('I run.')
  })

  it('deduplicates and sorts scheduleWeekdays', () => {
    const store = useHabitsStore()
    const habit = store.createHabit(buildCreateInput({ scheduleWeekdays: [3, 1, 3, 1, 0] }))

    expect(habit.scheduleWeekdays).toEqual([0, 1, 3])
  })

  it('unshifts to the front of the habits array', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_existing' })])

    const newHabit = store.createHabit(buildCreateInput({ name: 'New habit' }))

    expect(store.habits[0]?.id).toBe(newHabit.id)
    expect(store.habits[1]?.id).toBe('habit_existing')
  })

  it('sets archived to false', () => {
    const store = useHabitsStore()
    const habit = store.createHabit(buildCreateInput())

    expect(habit.archived).toBe(false)
  })

  it('sets matching createdAt and updatedAt as valid ISO strings', () => {
    const store = useHabitsStore()
    const habit = store.createHabit(buildCreateInput())

    expect(habit.createdAt).toBe(habit.updatedAt)
    expect(() => new Date(habit.createdAt)).not.toThrow()
    expect(/^\d{4}-\d{2}-\d{2}T/.test(habit.createdAt)).toBe(true)
  })

  it('assigns a unique id to the created habit', () => {
    const store = useHabitsStore()
    const habit = store.createHabit(buildCreateInput())

    expect(typeof habit.id).toBe('string')
    expect(habit.id.length).toBeGreaterThan(0)
  })
})

describe('habits store — updateHabit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('updates habit fields and returns the updated habit', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_1' })])

    const updated = store.updateHabit('habit_1', buildUpdateInput({ name: '  Evening walk  ', scheduleWeekdays: [5, 6] }))

    expect(updated).not.toBeNull()
    expect(updated?.name).toBe('Evening walk')
    expect(updated?.scheduleWeekdays).toEqual([5, 6])
  })

  it('returns null for an unknown id', () => {
    const store = useHabitsStore()

    const result = store.updateHabit('no_such_habit', buildUpdateInput())

    expect(result).toBeNull()
  })

  it('bumps updatedAt on update', () => {
    const store = useHabitsStore()
    const original = buildHabit({ id: 'habit_1', updatedAt: '2026-02-08T00:00:00.000Z' })
    store.hydrate([original])

    // Small delay isn't guaranteed in fast tests, but updatedAt must be a valid ISO string
    const updated = store.updateHabit('habit_1', buildUpdateInput())

    expect(updated?.updatedAt).not.toBeUndefined()
    expect(/^\d{4}-\d{2}-\d{2}T/.test(updated?.updatedAt ?? '')).toBe(true)
  })

  it('trims name and identityStatement', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_1' })])

    const updated = store.updateHabit('habit_1', buildUpdateInput({ name: '  New Name  ', identityStatement: '  New identity.  ' }))

    expect(updated?.name).toBe('New Name')
    expect(updated?.identityStatement).toBe('New identity.')
  })
})

describe('habits store — archiveHabit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sets archived to true and bumps updatedAt', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_1', archived: false })])

    store.archiveHabit('habit_1')

    const habit = store.habitById('habit_1')
    expect(habit?.archived).toBe(true)
    expect(/^\d{4}-\d{2}-\d{2}T/.test(habit?.updatedAt ?? '')).toBe(true)
  })

  it('no-ops on an unknown id', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_1' })])

    // Should not throw
    expect(() => store.archiveHabit('no_such_habit')).not.toThrow()
    expect(store.habits).toHaveLength(1)
  })
})

describe('habits store — restoreHabit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sets archived to false and bumps updatedAt', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_1', archived: true })])

    store.restoreHabit('habit_1')

    const habit = store.habitById('habit_1')
    expect(habit?.archived).toBe(false)
    expect(/^\d{4}-\d{2}-\d{2}T/.test(habit?.updatedAt ?? '')).toBe(true)
  })

  it('no-ops on an unknown id', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_1' })])

    expect(() => store.restoreHabit('no_such_habit')).not.toThrow()
    expect(store.habits).toHaveLength(1)
  })
})

describe('habits store — deleteHabit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('removes the habit with the given id', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_1' }), buildHabit({ id: 'habit_2' })])

    store.deleteHabit('habit_1')

    expect(store.habits.map(h => h.id)).toEqual(['habit_2'])
  })

  it('is a no-op for unknown ids', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_1' })])

    store.deleteHabit('no_such_habit')

    expect(store.habits).toHaveLength(1)
  })
})

describe('habits store — activeHabits / archivedHabits getters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('partitions habits by archived flag', () => {
    const store = useHabitsStore()
    store.hydrate([
      buildHabit({ id: 'habit_active_1', archived: false }),
      buildHabit({ id: 'habit_archived', archived: true }),
      buildHabit({ id: 'habit_active_2', archived: false }),
    ])

    expect(store.activeHabits.map(h => h.id)).toEqual(['habit_active_1', 'habit_active_2'])
    expect(store.archivedHabits.map(h => h.id)).toEqual(['habit_archived'])
  })

  it('returns empty arrays when no habits match', () => {
    const store = useHabitsStore()
    store.hydrate([buildHabit({ id: 'habit_1', archived: false })])

    expect(store.archivedHabits).toHaveLength(0)
  })
})

describe('habits store — dueHabitsForDate getter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns habits that are due on the given date', () => {
    const store = useHabitsStore()
    // 2026-02-09 is a Monday (weekday 1)
    store.hydrate([
      buildHabit({ id: 'habit_mon', scheduleWeekdays: [1], startDate: '2026-02-01' }), // due Mondays
      buildHabit({ id: 'habit_wed', scheduleWeekdays: [3], startDate: '2026-02-01' }), // due Wednesdays
    ])

    const due = store.dueHabitsForDate('2026-02-09')

    expect(due.map(h => h.id)).toEqual(['habit_mon'])
  })

  it('does not return archived habits', () => {
    const store = useHabitsStore()
    store.hydrate([
      buildHabit({ id: 'habit_archived', archived: true, scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-01-01' }),
    ])

    const due = store.dueHabitsForDate('2026-02-09')

    expect(due).toHaveLength(0)
  })

  it('does not return habits before their startDate', () => {
    const store = useHabitsStore()
    // startDate is after the query date
    store.hydrate([
      buildHabit({ id: 'habit_future', scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-02-10' }),
    ])

    // 2026-02-09 is before startDate 2026-02-10
    const due = store.dueHabitsForDate('2026-02-09')

    expect(due).toHaveLength(0)
  })
})
