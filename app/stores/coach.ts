import { defineStore } from 'pinia'
import type { CoachingSuggestion, Habit, HabitEntry } from '~/types/app-data'
import { generateSuggestionsForMissedEntry } from '~/utils/atomic-rules'

interface CoachState {
  suggestions: CoachingSuggestion[]
}

export const useCoachStore = defineStore('coach', {
  state: (): CoachState => ({
    suggestions: []
  }),
  getters: {
    suggestionsForEntry: (state) => (entryId: string): CoachingSuggestion[] =>
      state.suggestions.filter((suggestion) => suggestion.entryId === entryId),
    suggestionsByHabit: (state) => (habitId: string, entries: HabitEntry[]): CoachingSuggestion[] => {
      const entryIds = new Set(entries.filter((entry) => entry.habitId === habitId).map((entry) => entry.id))
      return state.suggestions.filter((suggestion) => entryIds.has(suggestion.entryId))
    }
  },
  actions: {
    hydrate(suggestions: CoachingSuggestion[]): void {
      this.suggestions = [...suggestions]
    },
    snapshot(): CoachingSuggestion[] {
      return [...this.suggestions]
    },
    generateForEntry(entry: HabitEntry, habit: Habit): CoachingSuggestion[] {
      this.suggestions = this.suggestions.filter((suggestion) => suggestion.entryId !== entry.id)
      const generated = generateSuggestionsForMissedEntry(entry, habit)
      this.suggestions.push(...generated)
      return generated
    },
    reconcileMissingSuggestions(habits: Habit[], entries: HabitEntry[]): number {
      const habitsById = new Map(habits.map((habit) => [habit.id, habit]))
      const suggestionEntryIds = new Set(this.suggestions.map((suggestion) => suggestion.entryId))
      let createdSuggestions = 0

      for (const entry of entries) {
        if (entry.status !== 'missed' || !entry.missReasonCode || suggestionEntryIds.has(entry.id)) {
          continue
        }

        const habit = habitsById.get(entry.habitId)
        if (!habit) {
          continue
        }

        const generated = generateSuggestionsForMissedEntry(entry, habit)
        if (!generated.length) {
          continue
        }

        this.suggestions.push(...generated)
        suggestionEntryIds.add(entry.id)
        createdSuggestions += generated.length
      }

      return createdSuggestions
    }
  }
})
