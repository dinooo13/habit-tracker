import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import type { Habit, HabitCreateInput, HabitPause, HabitUpdateInput } from '~/types/app-data'
import { compareDateKeys, nowIso, todayDateKey, isHabitDueOnDate } from '~/utils/domain/date'
import { createId } from '~/utils/domain/id'

interface HabitsState {
  habits: Habit[]
}

/**
 * Sanitise a `pauses` list into a stable, ordered shape: drop reversed ranges
 * (`end < start`) and sort by start date. Form input is already validated, but
 * normalising here keeps the persisted order deterministic.
 */
function normalizePauses(pauses: HabitPause[] | undefined): HabitPause[] {
  return (pauses ?? [])
    .filter(pause => compareDateKeys(pause.start, pause.end) <= 0)
    .map(pause => ({ start: pause.start, end: pause.end }))
    .sort((left, right) => compareDateKeys(left.start, right.start) || compareDateKeys(left.end, right.end))
}

export const useHabitsStore = defineStore('habits', {
  state: (): HabitsState => ({
    habits: [],
  }),
  getters: {
    activeHabits: (state): Habit[] => state.habits.filter(habit => !habit.archived),
    archivedHabits: (state): Habit[] => state.habits.filter(habit => habit.archived),
    habitById: state => (id: string): Habit | undefined => state.habits.find(habit => habit.id === id),
    dueHabitsForDate: state => (dateKey: string): Habit[] =>
      state.habits.filter(habit => isHabitDueOnDate(habit, dateKey)),
    todayDueHabits(): Habit[] {
      return this.dueHabitsForDate(todayDateKey())
    },
  },
  actions: {
    hydrate(habits: Habit[]): void {
      this.habits = [...habits]
    },
    /**
     * Point-in-time, proxy-free deep clone of the persisted habits for the
     * persistence layer (ADR-0004). `structuredClone(toRaw(...))` strips Vue
     * reactivity and detaches nested `scheduleWeekdays` / `pauses` arrays, so
     * adapters receive structured-clonable plain data and never re-sanitise.
     */
    snapshot(): Habit[] {
      return structuredClone(toRaw(this.habits))
    },
    createHabit(input: HabitCreateInput): Habit {
      const now = nowIso()
      const habit: Habit = {
        id: createId('habit'),
        name: input.name.trim(),
        type: input.type,
        identityStatement: input.identityStatement.trim(),
        scheduleWeekdays: [...new Set(input.scheduleWeekdays)].sort(),
        reminderTime: input.reminderTime,
        startDate: input.startDate,
        archived: false,
        pauses: normalizePauses(input.pauses),
        createdAt: now,
        updatedAt: now,
      }

      this.habits.unshift(habit)
      return habit
    },
    updateHabit(id: string, input: HabitUpdateInput): Habit | null {
      const habit = this.habitById(id)
      if (!habit) {
        return null
      }

      habit.name = input.name.trim()
      habit.type = input.type
      habit.identityStatement = input.identityStatement.trim()
      habit.scheduleWeekdays = [...new Set(input.scheduleWeekdays)].sort()
      habit.reminderTime = input.reminderTime
      habit.startDate = input.startDate
      habit.archived = input.archived
      habit.pauses = normalizePauses(input.pauses)
      habit.updatedAt = nowIso()

      return habit
    },
    archiveHabit(id: string): void {
      const habit = this.habitById(id)
      if (!habit) {
        return
      }

      habit.archived = true
      habit.updatedAt = nowIso()
    },
    restoreHabit(id: string): void {
      const habit = this.habitById(id)
      if (!habit) {
        return
      }

      habit.archived = false
      habit.updatedAt = nowIso()
    },
    /**
     * Single-store removal primitive: drop the habit by id. Cross-store cleanup
     * of its entries and suggestions is orchestrated by `deleteHabitCascade` in
     * `useHabitActions` (ADR-0016) — callers should prefer the cascade.
     */
    deleteHabit(id: string): void {
      // Filter over `toRaw(...)` so survivors stay plain objects: filtering the
      // reactive array reads elements through Vue's proxy and would repopulate
      // state with reactive proxies that make `snapshot()`'s `structuredClone`
      // throw `DataCloneError`, silently breaking persistence.
      this.habits = toRaw(this.habits).filter(habit => habit.id !== id)
    },
  },
})
