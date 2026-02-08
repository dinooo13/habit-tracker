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
    }
  }
})
