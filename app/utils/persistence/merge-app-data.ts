import {
  APP_DATA_SCHEMA_VERSION,
  type AppData,
  type AppSettings,
  type CoachingSuggestion,
  type Habit,
  type HabitEntry,
} from '~/types/app-data'

/**
 * Deterministic, dependency-free three-way merge of two app-data envelopes that
 * diverged from a common `base` (issue #67, ADR-0024). Pure — no CRDT, no
 * per-record timestamps, no framework — so it unit-tests in the fast `unit`
 * project (ADR-0012, ADR-0014).
 *
 * The rules, in one paragraph: records are keyed **habits by `id`**, **entries by
 * `habitId:date`**, **suggestions grouped by `entryId`**, **settings per field**.
 * For habits and entries, per key: if only one side differs from `base`, that
 * side wins; if neither differs, keep `base`; if both changed to the same value,
 * keep it; if both changed differently, or one deleted while the other modified,
 * it is a **conflict**. When both sides *added* the same key that `base` lacked,
 * they merge if the records are equal ignoring `id` (keeping the stored side's
 * `id`) and conflict otherwise. Suggestions never conflict: a group present on
 * both sides takes the stored side, a group present on one side is kept, and any
 * group whose `entryId` is absent from the merged entries is dropped. Settings
 * never conflict: each field takes whichever side changed it, preferring *ours*
 * when both changed, except `lastExportedAt` / `backupNudgeSnoozedUntil` (later
 * wins).
 *
 * `ours` is this tab's snapshot; `theirs` is the freshly-loaded stored envelope
 * (the "stored side" the rules refer to).
 */

export interface AppDataConflict {
  kind: 'habit' | 'entry'
  /** Habit id, or `${habitId}:${date}`. */
  key: string
  /** Human-readable label, e.g. `Morning run` / `Morning run · 2026-08-28`. */
  label: string
  cause: 'both-modified' | 'delete-vs-modify'
}

export type MergeResult
  = | { status: 'merged', data: AppData }
    | { status: 'conflict', conflicts: AppDataConflict[] }

/**
 * Thrown when a stale save cannot be merged because two tabs changed the same
 * record incompatibly. Carries the conflicts so the UI can name them. An empty
 * list is the bounded-livelock guard (a real collision always carries at least
 * one entry).
 */
export class AppDataConflictError extends Error {
  readonly conflicts: AppDataConflict[]

  constructor(conflicts: AppDataConflict[]) {
    super(conflicts.length ? `Cross-tab conflict on ${conflicts.length} record(s)` : 'Cross-tab conflict')
    this.name = 'AppDataConflictError'
    this.conflicts = conflicts
  }
}

// ── Explicit per-type equality ───────────────────────────────────────────────
// Deliberately field-by-field rather than a generic deep-equal or JSON
// round-trip: a field added to `Habit`/`HabitEntry` later fails to type-check
// here (via the exhaustive object below) forcing a deliberate decision, rather
// than silently comparing as "equal".

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function habitsEqualIgnoringId(a: Habit, b: Habit): boolean {
  return (
    a.name === b.name
    && a.type === b.type
    && a.identityStatement === b.identityStatement
    && arraysEqual(a.scheduleWeekdays, b.scheduleWeekdays)
    && a.reminderTime === b.reminderTime
    && a.startDate === b.startDate
    && a.archived === b.archived
    && a.pauses.length === b.pauses.length
    && a.pauses.every((pause, index) => pause.start === b.pauses[index]?.start && pause.end === b.pauses[index]?.end)
    && a.createdAt === b.createdAt
    && a.updatedAt === b.updatedAt
  )
}

function habitsEqual(a: Habit, b: Habit): boolean {
  return a.id === b.id && habitsEqualIgnoringId(a, b)
}

function entriesEqualIgnoringId(a: HabitEntry, b: HabitEntry): boolean {
  return (
    a.habitId === b.habitId
    && a.date === b.date
    && a.status === b.status
    && a.completedAt === b.completedAt
    && a.missReasonCode === b.missReasonCode
    && a.missReasonNote === b.missReasonNote
  )
}

function entriesEqual(a: HabitEntry, b: HabitEntry): boolean {
  return a.id === b.id && entriesEqualIgnoringId(a, b)
}

// ── Generic keyed three-way merge ────────────────────────────────────────────

interface KeyedMergeConfig<T> {
  keyOf: (value: T) => string
  /** Full equality (including `id`) — change/convergence detection for base-present keys. */
  equal: (a: T, b: T) => boolean
  /** Equality ignoring `id` — the dual-add case where both sides added a key `base` lacked. */
  equalIgnoringId: (a: T, b: T) => boolean
  conflictFor: (key: string, cause: AppDataConflict['cause']) => AppDataConflict
}

function toMap<T>(values: T[], keyOf: (value: T) => string): Map<string, T> {
  const map = new Map<string, T>()
  for (const value of values) {
    map.set(keyOf(value), value)
  }
  return map
}

function mergeKeyed<T>(
  base: T[],
  ours: T[],
  theirs: T[],
  config: KeyedMergeConfig<T>,
): { merged: T[], conflicts: AppDataConflict[] } {
  const baseMap = toMap(base, config.keyOf)
  const oursMap = toMap(ours, config.keyOf)
  const theirsMap = toMap(theirs, config.keyOf)

  // Deterministic key order: base keys first, then ours-only, then theirs-only.
  const keys: string[] = []
  const seen = new Set<string>()
  for (const key of [...baseMap.keys(), ...oursMap.keys(), ...theirsMap.keys()]) {
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
  }

  const merged: T[] = []
  const conflicts: AppDataConflict[] = []

  for (const key of keys) {
    const b = baseMap.get(key)
    const o = oursMap.get(key)
    const t = theirsMap.get(key)

    if (o && t) {
      if (b) {
        const oursChanged = !config.equal(o, b)
        const theirsChanged = !config.equal(t, b)
        if (!oursChanged) {
          // Unchanged on our side ⇒ take theirs (covers both-unchanged and theirs-only-changed).
          merged.push(t)
        }
        else if (!theirsChanged) {
          merged.push(o)
        }
        else if (config.equal(o, t)) {
          // Both changed to the same value — converged, not a conflict.
          merged.push(o)
        }
        else {
          conflicts.push(config.conflictFor(key, 'both-modified'))
        }
      }
      else if (config.equalIgnoringId(o, t)) {
        // Dual add of the same logical record (e.g. two tabs backfilling the
        // same habit-day) — keep the stored side's id.
        merged.push(t)
      }
      else {
        conflicts.push(config.conflictFor(key, 'both-modified'))
      }
    }
    else if (o && !t) {
      if (b) {
        // Theirs deleted it.
        if (!config.equal(o, b)) {
          conflicts.push(config.conflictFor(key, 'delete-vs-modify'))
        }
        // else: deletion wins over an untouched record — drop.
      }
      else {
        // Ours added it.
        merged.push(o)
      }
    }
    else if (!o && t) {
      if (b) {
        // Ours deleted it.
        if (!config.equal(t, b)) {
          conflicts.push(config.conflictFor(key, 'delete-vs-modify'))
        }
        // else: deletion wins — drop.
      }
      else {
        // Theirs added it.
        merged.push(t)
      }
    }
    // else: absent on both live sides (both deleted) — drop.
  }

  return { merged, conflicts }
}

// ── Settings (per field, never conflicts) ────────────────────────────────────

function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) {
    return b
  }
  if (b === null) {
    return a
  }
  return a >= b ? a : b
}

function mergeSettingsField<K extends keyof AppSettings>(
  key: K,
  base: AppSettings,
  ours: AppSettings,
  theirs: AppSettings,
): AppSettings[K] {
  const b = base[key]
  const o = ours[key]
  const t = theirs[key]
  const oursChanged = o !== b
  const theirsChanged = t !== b

  if (!oursChanged) {
    return t
  }
  if (!theirsChanged) {
    return o
  }
  // Both changed. The two timestamp-ish fields take the later value; every other
  // field prefers *ours* (the tab the user is actively driving).
  if (key === 'lastExportedAt' || key === 'backupNudgeSnoozedUntil') {
    return laterOf(o as string | null, t as string | null) as AppSettings[K]
  }
  return o
}

function mergeSettings(base: AppSettings, ours: AppSettings, theirs: AppSettings): AppSettings {
  return {
    notificationsEnabled: mergeSettingsField('notificationsEnabled', base, ours, theirs),
    dailyReviewTime: mergeSettingsField('dailyReviewTime', base, ours, theirs),
    weekStartsOn: mergeSettingsField('weekStartsOn', base, ours, theirs),
    primaryColor: mergeSettingsField('primaryColor', base, ours, theirs),
    lastExportedAt: mergeSettingsField('lastExportedAt', base, ours, theirs),
    backupNudgeSnoozedUntil: mergeSettingsField('backupNudgeSnoozedUntil', base, ours, theirs),
  }
}

// ── Suggestions (derived; never conflict) ────────────────────────────────────

function mergeSuggestions(
  ours: CoachingSuggestion[],
  theirs: CoachingSuggestion[],
  validEntryIds: Set<string>,
): CoachingSuggestion[] {
  const oursByEntry = groupByEntry(ours)
  const theirsByEntry = groupByEntry(theirs)

  const merged: CoachingSuggestion[] = []
  const seen = new Set<string>()
  for (const entryId of [...theirsByEntry.keys(), ...oursByEntry.keys()]) {
    if (seen.has(entryId)) {
      continue
    }
    seen.add(entryId)
    // Any group whose entry no longer exists after the entry merge is orphaned
    // and dropped (reconcileDerivedState regenerates it).
    if (!validEntryIds.has(entryId)) {
      continue
    }
    // A group present on both sides takes the stored side (theirs); a group on
    // one side only is kept.
    const group = theirsByEntry.get(entryId) ?? oursByEntry.get(entryId) ?? []
    merged.push(...group)
  }

  return merged
}

function groupByEntry(suggestions: CoachingSuggestion[]): Map<string, CoachingSuggestion[]> {
  const map = new Map<string, CoachingSuggestion[]>()
  for (const suggestion of suggestions) {
    const group = map.get(suggestion.entryId)
    if (group) {
      group.push(suggestion)
    }
    else {
      map.set(suggestion.entryId, [suggestion])
    }
  }
  return map
}

// ── Public entry point ───────────────────────────────────────────────────────

export function mergeAppData(base: AppData, ours: AppData, theirs: AppData): MergeResult {
  // Habit-name resolver for conflict labels, from every side (any name will do).
  const habitNames = new Map<string, string>()
  for (const habit of [...base.habits, ...theirs.habits, ...ours.habits]) {
    habitNames.set(habit.id, habit.name)
  }

  const habitResult = mergeKeyed(base.habits, ours.habits, theirs.habits, {
    keyOf: habit => habit.id,
    equal: habitsEqual,
    equalIgnoringId: habitsEqualIgnoringId,
    conflictFor: (key, cause) => ({
      kind: 'habit',
      key,
      label: habitNames.get(key) ?? key,
      cause,
    }),
  })

  const entryResult = mergeKeyed(base.entries, ours.entries, theirs.entries, {
    keyOf: entry => `${entry.habitId}:${entry.date}`,
    equal: entriesEqual,
    equalIgnoringId: entriesEqualIgnoringId,
    conflictFor: (key, cause) => {
      const [habitId, date] = splitEntryKey(key)
      const name = habitNames.get(habitId) ?? habitId
      return { kind: 'entry', key, label: `${name} · ${date}`, cause }
    },
  })

  const conflicts = [...habitResult.conflicts, ...entryResult.conflicts]
  if (conflicts.length) {
    return { status: 'conflict', conflicts }
  }

  const validEntryIds = new Set(entryResult.merged.map(entry => entry.id))

  return {
    status: 'merged',
    data: {
      schemaVersion: APP_DATA_SCHEMA_VERSION,
      habits: habitResult.merged,
      entries: entryResult.merged,
      suggestions: mergeSuggestions(ours.suggestions, theirs.suggestions, validEntryIds),
      settings: mergeSettings(base.settings, ours.settings, theirs.settings),
    },
  }
}

function splitEntryKey(key: string): [habitId: string, date: string] {
  // Entry keys are `${habitId}:${date}`; the date is a fixed-width `YYYY-MM-DD`
  // tail, so split on the last colon to tolerate a colon inside an id.
  const separator = key.lastIndexOf(':')
  return [key.slice(0, separator), key.slice(separator + 1)]
}
