import { describe, expect, it } from 'vitest'
import type { Habit } from '~/types/app-data'
import { buildCurrentHabitsPrompt, buildGettingStartedPrompt } from '~/utils/domain/ai-prompts'

function validHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: 'Read',
    type: 'build',
    identityStatement: 'Reader',
    scheduleWeekdays: [1],
    reminderTime: '08:00',
    startDate: '2026-02-01',
    archived: false,
    pauses: [],
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildGettingStartedPrompt (#69)', () => {
  it('injects the provided today date as the default startDate', () => {
    const prompt = buildGettingStartedPrompt('2026-08-24')
    expect(prompt).toContain('default to 2026-08-24 if I do not specify')
  })

  it('is deterministic for a given input and trimmed', () => {
    expect(buildGettingStartedPrompt('2026-01-01')).toBe(buildGettingStartedPrompt('2026-01-01'))
    const prompt = buildGettingStartedPrompt('2026-01-01')
    expect(prompt).toBe(prompt.trim())
    expect(prompt).toContain('habits-import.json')
  })
})

describe('buildCurrentHabitsPrompt (#69)', () => {
  it('embeds the provided habits as a JSON snapshot (id-bearing, no extra store fields)', () => {
    const prompt = buildCurrentHabitsPrompt([validHabit({ id: 'habit_abc', name: 'Meditate' })])
    expect(prompt).toContain('Current habits JSON:')
    expect(prompt).toContain('"id": "habit_abc"')
    expect(prompt).toContain('"name": "Meditate"')
  })

  it('renders an empty habits array for no habits', () => {
    const prompt = buildCurrentHabitsPrompt([])
    expect(prompt).toContain('"habits": []')
  })

  it('projects only the domain fields, dropping createdAt/updatedAt', () => {
    const prompt = buildCurrentHabitsPrompt([validHabit()])
    const jsonStart = prompt.indexOf('```json')
    const snapshot = prompt.slice(jsonStart)
    expect(snapshot).not.toContain('createdAt')
    expect(snapshot).not.toContain('updatedAt')
  })
})
