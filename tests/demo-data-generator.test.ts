import { describe, expect, it } from 'vitest'
import { generateDemoData } from '~/utils/domain/demo-data-generator'
import { generateSuggestionsForMissedEntry } from '~/utils/domain/atomic-rules'
import { parseAppData } from '~/utils/persistence/storage-schema'
import type { Habit } from '~/types/app-data'

// A fixed local anchor date keeps the seeded generator fully deterministic.
const ANCHOR = new Date(2026, 0, 15)

function contentOf(s: { law: string, direction: string, title: string, action: string, rationale: string }) {
  return { law: s.law, direction: s.direction, title: s.title, action: s.action, rationale: s.rationale }
}

describe('generateDemoData', () => {
  it('is reproducible for the same anchor date', () => {
    const a = generateDemoData(new Date(ANCHOR))
    const b = generateDemoData(new Date(ANCHOR))
    expect(a).toEqual(b)
  })

  it('produces a payload that validates as AppDataV2', () => {
    const data = generateDemoData(new Date(ANCHOR))
    const parsed = parseAppData(data)
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.entries.length).toBe(data.entries.length)
    expect(parsed.suggestions.length).toBe(data.suggestions.length)
  })

  it('routes every reflected miss through the real coaching engine', () => {
    const data = generateDemoData(new Date(ANCHOR))
    const habitsById = new Map<string, Habit>(data.habits.map(h => [h.id, h]))
    const suggestionsByEntry = new Map<string, typeof data.suggestions>()
    for (const s of data.suggestions) {
      const list = suggestionsByEntry.get(s.entryId) ?? []
      list.push(s)
      suggestionsByEntry.set(s.entryId, list)
    }

    const reflectedMisses = data.entries.filter(e => e.status === 'missed' && e.missReasonCode !== null)
    expect(reflectedMisses.length).toBeGreaterThan(0)

    const typesSeen = new Set<Habit['type']>()

    for (const entry of reflectedMisses) {
      const habit = habitsById.get(entry.habitId)
      expect(habit).toBeDefined()
      if (!habit) continue
      typesSeen.add(habit.type)

      const expected = generateSuggestionsForMissedEntry(entry, habit)
      const actual = suggestionsByEntry.get(entry.id) ?? []

      // Content must match the real engine exactly — no demo-only drift possible.
      expect(actual.map(contentOf)).toEqual(expected.map(contentOf))

      // Deterministic historical IDs and timestamps, indexed.
      actual.forEach((s, index) => {
        expect(s.id).toBe(`suggestion_${entry.id}_${index + 1}`)
        expect(s.createdAt).toBe(`${entry.date}T21:0${index}:00.000Z`)
        expect(s.direction).toBe(habit.type === 'build' ? 'increase' : 'decrease')
      })
    }

    // Both build and break habits are exercised in the checked dataset.
    expect(typesSeen.has('build')).toBe(true)
    expect(typesSeen.has('break')).toBe(true)
  })

  it('generates no suggestions for missed entries without a reason', () => {
    const data = generateDemoData(new Date(ANCHOR))
    const entriesWithSuggestions = new Set(data.suggestions.map(s => s.entryId))

    const unreflectedMisses = data.entries.filter(e => e.status === 'missed' && e.missReasonCode === null)
    expect(unreflectedMisses.length).toBeGreaterThan(0)

    for (const entry of unreflectedMisses) {
      expect(entriesWithSuggestions.has(entry.id)).toBe(false)
    }
  })
})
