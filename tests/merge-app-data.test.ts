import { describe, expect, it } from 'vitest'
import {
  APP_DATA_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type AppData,
  type AppSettings,
  type CoachingSuggestion,
  type Habit,
  type HabitEntry,
} from '~/types/app-data'
import { mergeAppData } from '~/utils/persistence/merge-app-data'

function habit(id: string, overrides: Partial<Habit> = {}): Habit {
  return {
    id,
    name: `Habit ${id}`,
    type: 'build',
    identityStatement: 'I am consistent.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: null,
    startDate: '2026-08-01',
    archived: false,
    pauses: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function entry(id: string, habitId: string, date: string, overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id,
    habitId,
    date,
    status: 'missed',
    completedAt: null,
    missReasonCode: null,
    missReasonNote: null,
    ...overrides,
  }
}

function suggestion(id: string, entryId: string): CoachingSuggestion {
  return {
    id,
    entryId,
    law: 'obvious',
    direction: 'increase',
    title: 'Make it obvious',
    action: 'Set a cue',
    rationale: 'Cues drive behaviour',
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

function appData(overrides: Partial<AppData> = {}): AppData {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits: [],
    entries: [],
    suggestions: [],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  }
}

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

describe('mergeAppData (#67)', () => {
  describe('habits', () => {
    it('merges disjoint habit edits', () => {
      const base = appData({ habits: [habit('h1'), habit('h2')] })
      const ours = appData({ habits: [habit('h1', { name: 'Renamed by us' }), habit('h2')] })
      const theirs = appData({ habits: [habit('h1'), habit('h2', { name: 'Renamed by them' })] })

      const result = mergeAppData(base, ours, theirs)
      expect(result.status).toBe('merged')
      if (result.status !== 'merged') {
        return
      }
      const byId = new Map(result.data.habits.map(h => [h.id, h]))
      expect(byId.get('h1')?.name).toBe('Renamed by us')
      expect(byId.get('h2')?.name).toBe('Renamed by them')
    })

    it('conflicts when the same habit changed on both sides differently', () => {
      const base = appData({ habits: [habit('h1')] })
      const ours = appData({ habits: [habit('h1', { name: 'Ours' })] })
      const theirs = appData({ habits: [habit('h1', { scheduleWeekdays: [1] })] })

      const result = mergeAppData(base, ours, theirs)
      expect(result.status).toBe('conflict')
      if (result.status !== 'conflict') {
        return
      }
      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0]).toMatchObject({ kind: 'habit', key: 'h1', cause: 'both-modified' })
    })

    it('is not a conflict when both sides converge on the same value', () => {
      const base = appData({ habits: [habit('h1')] })
      const ours = appData({ habits: [habit('h1', { name: 'Same' })] })
      const theirs = appData({ habits: [habit('h1', { name: 'Same' })] })

      expect(mergeAppData(base, ours, theirs).status).toBe('merged')
    })

    it('conflicts on delete-vs-modify but merges delete-vs-untouched', () => {
      const base = appData({ habits: [habit('h1')] })
      const deleteVsModify = mergeAppData(
        base,
        appData({ habits: [] }),
        appData({ habits: [habit('h1', { name: 'Edited' })] }),
      )
      expect(deleteVsModify.status).toBe('conflict')
      if (deleteVsModify.status === 'conflict') {
        expect(deleteVsModify.conflicts[0]?.cause).toBe('delete-vs-modify')
      }

      const deleteVsUntouched = mergeAppData(base, appData({ habits: [] }), appData({ habits: [habit('h1')] }))
      expect(deleteVsUntouched.status).toBe('merged')
      if (deleteVsUntouched.status === 'merged') {
        expect(deleteVsUntouched.data.habits).toHaveLength(0)
      }
    })
  })

  describe('entries', () => {
    it('merges disjoint entry edits keyed by habitId:date', () => {
      const base = appData()
      const ours = appData({ entries: [entry('e1', 'h1', '2026-08-10', { status: 'done' })] })
      const theirs = appData({ entries: [entry('e2', 'h2', '2026-08-11', { status: 'skipped' })] })

      const result = mergeAppData(base, ours, theirs)
      expect(result.status).toBe('merged')
      if (result.status !== 'merged') {
        return
      }
      const byKey = new Map(result.data.entries.map(e => [`${e.habitId}:${e.date}`, e]))
      expect(byKey.get('h1:2026-08-10')?.status).toBe('done')
      expect(byKey.get('h2:2026-08-11')?.status).toBe('skipped')
    })

    it('merges a dual auto-backfill to a single entry, keeping the stored side id', () => {
      const base = appData()
      const ours = appData({ entries: [entry('ours-id', 'h1', '2026-08-10')] })
      const theirs = appData({ entries: [entry('theirs-id', 'h1', '2026-08-10')] })

      const result = mergeAppData(base, ours, theirs)
      expect(result.status).toBe('merged')
      if (result.status !== 'merged') {
        return
      }
      expect(result.data.entries).toHaveLength(1)
      expect(result.data.entries[0]?.id).toBe('theirs-id')
    })

    it('conflicts on a dual-add with different content', () => {
      const base = appData()
      const ours = appData({ entries: [entry('a', 'h1', '2026-08-10', { status: 'done' })] })
      const theirs = appData({ entries: [entry('b', 'h1', '2026-08-10', { status: 'missed' })] })

      const result = mergeAppData(base, ours, theirs)
      expect(result.status).toBe('conflict')
      if (result.status === 'conflict') {
        expect(result.conflicts[0]).toMatchObject({ kind: 'entry', key: 'h1:2026-08-10' })
      }
    })

    it('conflicts when the same entry got different statuses', () => {
      const base = appData({ entries: [entry('e1', 'h1', '2026-08-10', { status: 'missed' })] })
      const ours = appData({ entries: [entry('e1', 'h1', '2026-08-10', { status: 'done' })] })
      const theirs = appData({ entries: [entry('e1', 'h1', '2026-08-10', { status: 'skipped' })] })

      const result = mergeAppData(base, ours, theirs)
      expect(result.status).toBe('conflict')
      if (result.status === 'conflict') {
        expect(result.conflicts[0]?.key).toBe('h1:2026-08-10')
      }
    })
  })

  describe('suggestions (never conflict)', () => {
    it('takes the stored side per entry group and drops orphans', () => {
      // Both sides have a group for e1 (with different ids); ours also holds a
      // group for a now-deleted entry.
      const base = appData({ entries: [entry('e1', 'h1', '2026-08-10')] })
      const ours = appData({
        entries: [entry('e1', 'h1', '2026-08-10')],
        suggestions: [suggestion('s-ours', 'e1'), suggestion('s-orphan', 'gone')],
      })
      const theirs = appData({
        entries: [entry('e1', 'h1', '2026-08-10')],
        suggestions: [suggestion('s-theirs', 'e1')],
      })

      const result = mergeAppData(base, ours, theirs)
      expect(result.status).toBe('merged')
      if (result.status !== 'merged') {
        return
      }
      expect(result.data.suggestions).toHaveLength(1)
      expect(result.data.suggestions[0]?.id).toBe('s-theirs')
    })
  })

  describe('settings (never conflict)', () => {
    it('merges disjoint field changes', () => {
      const base = appData({ settings: settings() })
      const ours = appData({ settings: settings({ primaryColor: 'rose' }) })
      const theirs = appData({ settings: settings({ weekStartsOn: 0 }) })

      const result = mergeAppData(base, ours, theirs)
      expect(result.status).toBe('merged')
      if (result.status !== 'merged') {
        return
      }
      expect(result.data.settings.primaryColor).toBe('rose')
      expect(result.data.settings.weekStartsOn).toBe(0)
    })

    it('prefers ours when both change a field, but takes the later timestamp', () => {
      const base = appData({ settings: settings({ lastExportedAt: null }) })
      const ours = appData({
        settings: settings({ primaryColor: 'sky', lastExportedAt: '2026-08-10T00:00:00.000Z' }),
      })
      const theirs = appData({
        settings: settings({ primaryColor: 'amber', lastExportedAt: '2026-08-20T00:00:00.000Z' }),
      })

      const result = mergeAppData(base, ours, theirs)
      expect(result.status).toBe('merged')
      if (result.status !== 'merged') {
        return
      }
      expect(result.data.settings.primaryColor).toBe('sky')
      expect(result.data.settings.lastExportedAt).toBe('2026-08-20T00:00:00.000Z')
    })
  })
})
