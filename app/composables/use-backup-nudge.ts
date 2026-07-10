import { computed, type ComputedRef } from 'vue'
import type { Habit, HabitEntry } from '~/types/app-data'
import { BACKUP_NUDGE_SNOOZE_DAYS, BACKUP_NUDGE_THRESHOLD_WEEKS } from '~/types/app-data'
import { addDays, compareDateKeys, daysBetween, nowIso, todayDateKey, toDateKeyLocal } from '~/utils/domain/date'

interface BackupNudgeInputs {
  habits: Habit[]
  entries: HabitEntry[]
  lastExportedAt: string | null
  backupNudgeSnoozedUntil: string | null
  todayKey: string
}

interface BackupNudgeResult {
  shouldShow: boolean
  weeksUnexported: number
}

// Turn an ISO timestamp into a local YYYY-MM-DD date key, falling back to null
// when the value is missing or unparseable.
function isoToDateKey(iso: string | null): string | null {
  if (!iso) {
    return null
  }

  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return toDateKeyLocal(parsed)
}

// Earliest date key across all habit createdAt timestamps and entry dates. Used as the
// "data age" anchor when the user has never exported (lastExportedAt is null).
function earliestDataDateKey(habits: Habit[], entries: HabitEntry[]): string | null {
  let earliest: string | null = null

  const consider = (dateKey: string | null): void => {
    if (!dateKey) {
      return
    }
    if (!earliest || compareDateKeys(dateKey, earliest) < 0) {
      earliest = dateKey
    }
  }

  for (const habit of habits) {
    consider(isoToDateKey(habit.createdAt))
  }
  for (const entry of entries) {
    consider(entry.date)
  }

  return earliest
}

/**
 * Pure backup-nudge decision (issue #8). The nudge shows only when there is something to
 * lose (≥1 habit) and the data has gone unexported for at least the threshold, unless the
 * user has snoozed a recent dismissal.
 */
export function computeBackupNudge(inputs: BackupNudgeInputs): BackupNudgeResult {
  const { habits, entries, lastExportedAt, backupNudgeSnoozedUntil, todayKey } = inputs

  if (!habits.length) {
    return { shouldShow: false, weeksUnexported: 0 }
  }

  const anchor = isoToDateKey(lastExportedAt) ?? earliestDataDateKey(habits, entries)
  if (!anchor) {
    return { shouldShow: false, weeksUnexported: 0 }
  }

  // A future anchor (e.g. a clock skew) yields a negative diff; clamp to 0 weeks.
  const days = Math.max(0, daysBetween(anchor, todayKey))
  const weeksUnexported = Math.floor(days / 7)

  const isSnoozed
    = Boolean(backupNudgeSnoozedUntil) && compareDateKeys(todayKey, backupNudgeSnoozedUntil as string) <= 0

  const shouldShow = weeksUnexported >= BACKUP_NUDGE_THRESHOLD_WEEKS && !isSnoozed

  return { shouldShow, weeksUnexported }
}

interface UseBackupNudge {
  shouldShow: ComputedRef<boolean>
  weeksUnexported: ComputedRef<number>
  message: ComputedRef<string>
  dismiss: () => void
  markExported: () => void
}

export function useBackupNudge(): UseBackupNudge {
  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const settingsStore = useSettingsStore()

  const result = computed(() =>
    computeBackupNudge({
      habits: habitsStore.habits,
      entries: entriesStore.entries,
      lastExportedAt: settingsStore.lastExportedAt,
      backupNudgeSnoozedUntil: settingsStore.backupNudgeSnoozedUntil,
      todayKey: todayDateKey(),
    }),
  )

  const shouldShow = computed(() => result.value.shouldShow)
  const weeksUnexported = computed(() => result.value.weeksUnexported)

  const message = computed(() => {
    const weeks = weeksUnexported.value
    return `You have ${weeks} ${weeks === 1 ? 'week' : 'weeks'} of unexported data.`
  })

  // Snooze the nudge for the configured window after a dismissal. Persistence is automatic
  // via the bootstrap watch on settingsStore.snapshot().
  function dismiss(): void {
    settingsStore.setBackupNudgeSnoozedUntil(addDays(todayDateKey(), BACKUP_NUDGE_SNOOZE_DAYS))
  }

  // Record a successful export and clear any active snooze so recency drives the next nudge.
  function markExported(): void {
    settingsStore.setLastExportedAt(nowIso())
    settingsStore.setBackupNudgeSnoozedUntil(null)
  }

  return { shouldShow, weeksUnexported, message, dismiss, markExported }
}
