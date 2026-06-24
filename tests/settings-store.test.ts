import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '~/stores/settings'
import { DEFAULT_SETTINGS } from '~/types/app-data'

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults backup-nudge fields to null', () => {
    const store = useSettingsStore()
    expect(store.lastExportedAt).toBeNull()
    expect(store.backupNudgeSnoozedUntil).toBeNull()
  })

  it('setLastExportedAt updates the getter and snapshot (#8)', () => {
    const store = useSettingsStore()
    store.setLastExportedAt('2026-06-01T10:00:00.000Z')

    expect(store.lastExportedAt).toBe('2026-06-01T10:00:00.000Z')
    expect(store.snapshot().lastExportedAt).toBe('2026-06-01T10:00:00.000Z')
  })

  it('setBackupNudgeSnoozedUntil updates the getter and snapshot (#8)', () => {
    const store = useSettingsStore()
    store.setBackupNudgeSnoozedUntil('2026-06-08')

    expect(store.backupNudgeSnoozedUntil).toBe('2026-06-08')
    expect(store.snapshot().backupNudgeSnoozedUntil).toBe('2026-06-08')
  })

  it('hydrate backfills missing backup-nudge fields from defaults (#8)', () => {
    const store = useSettingsStore()
    const legacySettings = { ...DEFAULT_SETTINGS } as Record<string, unknown>
    delete legacySettings.lastExportedAt
    delete legacySettings.backupNudgeSnoozedUntil

    store.hydrate(legacySettings as never)

    expect(store.lastExportedAt).toBeNull()
    expect(store.backupNudgeSnoozedUntil).toBeNull()
  })
})
