import { defineStore } from 'pinia'
import type { Habit, HabitEntry, HabitStatus, MissReasonCode } from '~/types/app-data'
import { addDays, compareDateKeys, dateKeyRange, isHabitDueOnDate, nowIso } from '~/utils/date'
import { createId } from '~/utils/id'

interface EntriesState {
  entries: HabitEntry[]
}

function entryLookupKey(habitId: string, date: string): string {
  return `${habitId}:${date}`
}

export const useEntriesStore = defineStore('entries', {
  state: (): EntriesState => ({
    entries: []
  }),
  getters: {
    entryLookup: (state): Map<string, HabitEntry> => {
      const lookup = new Map<string, HabitEntry>()
      for (const entry of state.entries) {
        lookup.set(entryLookupKey(entry.habitId, entry.date), entry)
      }
      return lookup
    },
    entryByHabitAndDate(): (habitId: string, date: string) => HabitEntry | undefined {
      return (habitId, date) => this.entryLookup.get(entryLookupKey(habitId, date))
    },
    entriesForDate: (state) => (date: string): HabitEntry[] =>
      state.entries.filter((entry) => entry.date === date),
    pendingReflectionEntries: (state): HabitEntry[] =>
      state.entries
        .filter((entry) => entry.status === 'missed' && entry.missReasonCode === null)
        .sort((left, right) => right.date.localeCompare(left.date)),
    entriesByHabit: (state) => (habitId: string): HabitEntry[] =>
      state.entries
        .filter((entry) => entry.habitId === habitId)
        .sort((left, right) => left.date.localeCompare(right.date))
  },
  actions: {
    hydrate(entries: HabitEntry[]): void {
      this.entries = [...entries]
    },
    snapshot(): HabitEntry[] {
      return [...this.entries]
    },
    setStatus(habitId: string, date: string, status: HabitStatus): HabitEntry {
      const existing = this.entryByHabitAndDate(habitId, date)
      const completedAt = status === 'done' ? nowIso() : null

      if (existing) {
        existing.status = status
        existing.completedAt = completedAt

        if (status !== 'missed') {
          existing.missReasonCode = null
          existing.missReasonNote = null
        }

        return existing
      }

      const created: HabitEntry = {
        id: createId('entry'),
        habitId,
        date,
        status,
        completedAt,
        missReasonCode: null,
        missReasonNote: null
      }

      this.entries.push(created)
      return created
    },
    removeEntry(entryId: string): HabitEntry | null {
      const index = this.entries.findIndex((entry) => entry.id === entryId)
      if (index < 0) {
        return null
      }

      const [removed] = this.entries.splice(index, 1)
      return removed ?? null
    },
    clearStatus(habitId: string, date: string): HabitEntry | null {
      const index = this.entries.findIndex((entry) => entry.habitId === habitId && entry.date === date)
      if (index < 0) {
        return null
      }

      const [removed] = this.entries.splice(index, 1)
      return removed ?? null
    },
    setMissReason(entryId: string, reason: MissReasonCode, note: string | null): HabitEntry | null {
      const entry = this.entries.find((candidate) => candidate.id === entryId)
      if (!entry) {
        return null
      }

      entry.status = 'missed'
      entry.missReasonCode = reason
      entry.missReasonNote = note?.trim() || null
      return entry
    },
    ensureMissedEntries(habits: Habit[], currentDateKey: string): number {
      const latestHistoricalDate = addDays(currentDateKey, -1)
      const existingLookup = new Set(this.entries.map((entry) => entryLookupKey(entry.habitId, entry.date)))
      let createdCount = 0

      for (const habit of habits) {
        if (habit.archived) {
          continue
        }

        if (compareDateKeys(habit.startDate, latestHistoricalDate) > 0) {
          continue
        }

        const candidateDates = dateKeyRange(habit.startDate, latestHistoricalDate)
        for (const date of candidateDates) {
          if (!isHabitDueOnDate(habit, date)) {
            continue
          }

          const lookupKey = entryLookupKey(habit.id, date)
          if (existingLookup.has(lookupKey)) {
            continue
          }

          this.entries.push({
            id: createId('entry'),
            habitId: habit.id,
            date,
            status: 'missed',
            completedAt: null,
            missReasonCode: null,
            missReasonNote: null
          })
          existingLookup.add(lookupKey)
          createdCount += 1
        }
      }

      return createdCount
    },
    streakForHabit(habitId: string): number {
      const entries = this.entriesByHabit(habitId)
      if (!entries.length) {
        return 0
      }

      let streak = 0
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index]
        if (!entry) {
          continue
        }

        if (entry.status === 'done') {
          streak += 1
          continue
        }

        if (streak > 0) {
          break
        }
      }

      return streak
    },
    completionRateForHabit(habit: Habit, fromDate: string, toDate: string): number {
      const dates = dateKeyRange(fromDate, toDate)
      const dueDates = dates.filter((date) => isHabitDueOnDate(habit, date))

      if (!dueDates.length) {
        return 0
      }

      const doneCount = dueDates.filter((date) => this.entryByHabitAndDate(habit.id, date)?.status === 'done').length
      return Math.round((doneCount / dueDates.length) * 100)
    },
    reasonDistribution(): Record<string, number> {
      const distribution: Record<string, number> = {}

      for (const entry of this.entries) {
        if (!entry.missReasonCode) {
          continue
        }

        distribution[entry.missReasonCode] = (distribution[entry.missReasonCode] ?? 0) + 1
      }

      return distribution
    }
  }
})
