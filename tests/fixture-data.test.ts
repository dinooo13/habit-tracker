import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseAppData } from '~/utils/storage-schema'

const FIXTURE_PATH = 'tests/fixtures/habit-tracker-6-weeks.json'

describe('fixture data', () => {
  it('contains valid app data with mixed tracking outcomes', () => {
    const raw = readFileSync(FIXTURE_PATH, 'utf8')
    const parsed = parseAppData(JSON.parse(raw))

    expect(parsed.habits.length).toBeGreaterThanOrEqual(5)
    expect(parsed.entries.length).toBeGreaterThan(140)

    const statuses = new Set(parsed.entries.map((entry) => entry.status))
    expect(statuses.has('done')).toBe(true)
    expect(statuses.has('missed')).toBe(true)
    expect(statuses.has('skipped')).toBe(true)

    const reflectedMissed = parsed.entries.filter((entry) => entry.status === 'missed' && entry.missReasonCode)
    expect(reflectedMissed.length).toBeGreaterThan(0)
    expect(parsed.suggestions.length).toBeGreaterThan(0)

    const dates = parsed.entries.map((entry) => entry.date).sort()
    expect(dates[0]).toBe('2025-12-26')
    expect(dates[dates.length - 1]).toBe('2026-02-08')
  })
})
