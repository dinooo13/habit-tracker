import { describe, expect, it } from 'vitest'
import { createEmptyAppData, parseAppData } from '~/utils/storage-schema'

describe('storage schema', () => {
  it('creates a valid empty payload', () => {
    const empty = createEmptyAppData()
    expect(() => parseAppData(empty)).not.toThrow()
  })

  it('rejects invalid schema versions', () => {
    const invalid = {
      ...createEmptyAppData(),
      schemaVersion: 99
    }

    expect(() => parseAppData(invalid)).toThrow()
  })

  it('rejects malformed habit fields', () => {
    const payload = createEmptyAppData()
    payload.habits.push({
      id: 'h1',
      name: 'Read',
      type: 'build',
      identityStatement: 'Reader',
      scheduleWeekdays: [1],
      reminderTime: '99:99',
      startDate: '2026-02-01',
      archived: false,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z'
    })

    expect(() => parseAppData(payload)).toThrow()
  })
})
