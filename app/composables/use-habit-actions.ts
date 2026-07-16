import type { HabitEntry, HabitStatus, MissReasonCode } from '~/types/app-data'
import { isDateInHabitPause } from '~/utils/domain/date'
import { useHabitsStore } from '~/stores/habits'
import { useEntriesStore } from '~/stores/entries'
import { useCoachStore } from '~/stores/coach'

/**
 * A `CoachingSuggestion` may exist **iff** its entry is a *reflected* miss:
 * `status === 'missed' && missReasonCode !== null`. Any other terminal state
 * (`done` / `skipped` / an unreflected miss) must own zero suggestions.
 */
function isReflectedMiss(entry: HabitEntry): boolean {
  return entry.status === 'missed' && entry.missReasonCode !== null
}

/**
 * Owns every cross-store entry↔suggestion transaction so pages never wire the
 * side-effects by hand. It composes the existing single-store primitives and is
 * the single enforcer of the entry↔suggestion invariant (ADR-0015). It holds no
 * state of its own; stores are imported explicitly so unit tests run in the fast
 * Node Vitest project (ADR-0012) without booting Nuxt.
 */
export function useHabitActions() {
  const habitsStore = useHabitsStore()
  const entriesStore = useEntriesStore()
  const coachStore = useCoachStore()

  /**
   * Record a Done / Missed / Skip decision from the queue. Writes the entry,
   * then drops any suggestions unless the result is a reflected miss — so a
   * reflected miss flipped to `done`/`skipped` no longer leaves orphaned
   * suggestions counting toward insights uptake.
   */
  function recordHabitStatus(habitId: string, date: string, status: HabitStatus): HabitEntry {
    const entry = entriesStore.setStatus(habitId, date, status)
    if (!isReflectedMiss(entry)) {
      coachStore.removeForEntry(entry.id)
    }
    return entry
  }

  /**
   * Move a reviewed entry back to open: remove the entry and any suggestions it
   * owned. Returns the removed entry, or `null` when the day had no entry.
   */
  function reopenEntry(habitId: string, date: string): HabitEntry | null {
    const removed = entriesStore.clearStatus(habitId, date)
    if (!removed) {
      return null
    }

    coachStore.removeForEntry(removed.id)
    return removed
  }

  /**
   * Capture a reflection for a missed entry and regenerate its coaching exactly
   * once (`generateForEntry` dedupes by `entryId`). No-ops to `null` when the
   * entry or its habit no longer exists.
   */
  function recordReflection(
    entryId: string,
    reason: MissReasonCode,
    note: string | null,
  ): { entry: HabitEntry, suggestions: ReturnType<typeof coachStore.generateForEntry> } | null {
    const entry = entriesStore.setMissReason(entryId, reason, note)
    if (!entry) {
      return null
    }

    const habit = habitsStore.habitById(entry.habitId)
    if (!habit) {
      return null
    }

    const suggestions = coachStore.generateForEntry(entry, habit)
    return { entry, suggestions }
  }

  /**
   * Retroactively clean up after a pause is added or extended: remove any
   * auto-generated `missed` entry (unreflected) that now falls inside a pause
   * range, along with its suggestions. `done`/`skipped` and reflected misses are
   * preserved (ADR-0010). Relocated here from the habits store so no store
   * imports another store. Returns the number of entries removed.
   */
  function reconcilePauseCleanup(habitId: string): number {
    const habit = habitsStore.habitById(habitId)
    if (!habit || !habit.pauses.length) {
      return 0
    }

    const toRemove = entriesStore.entries.filter(
      entry =>
        entry.habitId === habit.id
        && entry.status === 'missed'
        && entry.missReasonCode === null
        && isDateInHabitPause(habit, entry.date),
    )

    for (const entry of toRemove) {
      coachStore.removeForEntry(entry.id)
      entriesStore.removeEntry(entry.id)
    }

    return toRemove.length
  }

  /**
   * Safely hard-delete a habit and every trace it owns: its entries and their
   * suggestions, then the habit itself. Ships unwired (no delete UI yet) but
   * closes the orphan risk of the bare `habitsStore.deleteHabit` primitive.
   * Returns the counts removed.
   */
  function deleteHabitCascade(habitId: string): { entries: number, suggestions: number } {
    const relatedEntries = entriesStore.entries.filter(entry => entry.habitId === habitId)
    let removedSuggestions = 0

    for (const entry of relatedEntries) {
      removedSuggestions += coachStore.removeForEntry(entry.id)
      entriesStore.removeEntry(entry.id)
    }

    habitsStore.deleteHabit(habitId)
    return { entries: relatedEntries.length, suggestions: removedSuggestions }
  }

  return {
    recordHabitStatus,
    reopenEntry,
    recordReflection,
    reconcilePauseCleanup,
    deleteHabitCascade,
  }
}
