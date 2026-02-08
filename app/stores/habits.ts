import { defineStore } from 'pinia'
import type { Habit, HabitCreateInput, HabitUpdateInput } from '~/types/app-data'
import { nowIso, todayDateKey, isHabitDueOnDate } from '~/utils/date'
import { createId } from '~/utils/id'

interface HabitsState {
  habits: Habit[]
}

export const useHabitsStore = defineStore('habits', {
  state: (): HabitsState => ({
    habits: []
  }),
  getters: {
    activeHabits: (state): Habit[] => state.habits.filter((habit) => !habit.archived),
    archivedHabits: (state): Habit[] => state.habits.filter((habit) => habit.archived),
    habitById: (state) => (id: string): Habit | undefined => state.habits.find((habit) => habit.id === id),
    dueHabitsForDate: (state) => (dateKey: string): Habit[] =>
      state.habits.filter((habit) => isHabitDueOnDate(habit, dateKey)),
    todayDueHabits(): Habit[] {
      return this.dueHabitsForDate(todayDateKey())
    }
  },
  actions: {
    hydrate(habits: Habit[]): void {
      this.habits = [...habits]
    },
    snapshot(): Habit[] {
      return [...this.habits]
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
        createdAt: now,
        updatedAt: now
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
    deleteHabit(id: string): void {
      this.habits = this.habits.filter((habit) => habit.id !== id)
    }
  }
})
