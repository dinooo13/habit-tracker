import type { AppData, Habit } from '~/types/app-data'
import { nowIso } from '~/utils/domain/date'
import { assertRawHabitLimits, parseAppData, parseLenientHabit } from '~/utils/persistence/storage-schema'

/**
 * Pure backup import/export/merge helpers extracted from `settings.vue` (issue #69).
 *
 * These are deliberately framework-free (no stores, no DOM, no toasts) so the
 * import parsing and merge rules can be unit-tested directly. The page keeps the
 * UI-boundary side effects — security logging, quota checks, backup-nudge, toasts,
 * the file-size gate, and the Blob/anchor download glue — at the call sites.
 */

/**
 * Extract importable habits from an untrusted habits-only import payload.
 *
 * First attempts a full-backup parse (`parseAppData`) and returns its habits when
 * the payload is a complete `AppData` envelope. Otherwise falls back to a
 * habits-array shape — either the payload itself or its `habits` property — runs
 * the raw-count preflight (`assertRawHabitLimits`, issue #35, which THROWS on
 * overflow so the caller's catch surfaces it), then maps each raw item through the
 * lenient import schema, dropping the ones that fail validation.
 *
 * Returns an empty array when no habits-array shape is present.
 */
export function extractImportedHabits(payload: unknown): Habit[] {
  try {
    return parseAppData(payload).habits
  }
  catch {
    // Not a full backup envelope — continue with habits-only payload formats.
  }

  const rawHabits = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { habits?: unknown }).habits)
      ? (payload as { habits: unknown[] }).habits
      : null

  if (!rawHabits) {
    return []
  }

  // Enforce the same raw habit / nested-array caps as the strict path before any
  // mapping, deduplication, or filtering, so the lenient fallback can't become a
  // bypass for an oversized payload (issue #35). Throws on overflow, which the
  // importing caller surfaces through its normal import-error catch.
  assertRawHabitLimits(rawHabits)

  return rawHabits
    .map(item => parseLenientHabit(item))
    .filter((item): item is Habit => item !== null)
}

/**
 * Merge imported habits into the existing habit list for a habits-only import.
 *
 * Deduplicates imported habits by id (last write wins), then for each: updates an
 * existing habit in place — preserving its original `id` and `createdAt` and
 * stamping a fresh `updatedAt` — or appends it as a new habit. Existing habits not
 * present in the import are kept unchanged. Pure: the existing snapshot is passed
 * in rather than read from a store.
 */
export function mergeHabitsForImport(
  existingHabits: Habit[],
  importedHabits: Habit[],
): { mergedHabits: Habit[], addedCount: number, updatedCount: number } {
  const existingHabitsById = new Map(existingHabits.map(habit => [habit.id, habit]))
  const dedupedImported = [...new Map(importedHabits.map(habit => [habit.id, habit])).values()]
  const mergedHabits: Habit[] = []
  const importedIds = new Set<string>()
  let addedCount = 0
  let updatedCount = 0

  for (const importedHabit of dedupedImported) {
    const existingHabit = existingHabitsById.get(importedHabit.id)

    if (existingHabit) {
      mergedHabits.push({
        ...existingHabit,
        ...importedHabit,
        id: existingHabit.id,
        createdAt: existingHabit.createdAt,
        updatedAt: nowIso(),
      })
      updatedCount += 1
    }
    else {
      mergedHabits.push(importedHabit)
      addedCount += 1
    }

    importedIds.add(importedHabit.id)
  }

  for (const existingHabit of existingHabits) {
    if (!importedIds.has(existingHabit.id)) {
      mergedHabits.push(existingHabit)
    }
  }

  return { mergedHabits, addedCount, updatedCount }
}

/** Serialize an app-data envelope to the pretty-printed JSON used for backups. */
export function serializeBackup(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

/** The download filename for a backup taken on the given local date key. */
export function backupFilename(dateKey: string): string {
  return `habit-tracker-${dateKey}.json`
}
