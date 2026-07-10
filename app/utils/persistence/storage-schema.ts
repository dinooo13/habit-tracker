import { z } from 'zod'
import {
  APP_DATA_SCHEMA_VERSION,
  COLLECTION_LIMITS,
  DEFAULT_SETTINGS,
  FIELD_LIMITS,
  MISS_REASON_CODES,
  PRIMARY_COLOR_OPTIONS,
  type AppDataV2,
  type Habit,
} from '~/types/app-data'
import { compareDateKeys, isValidDateKey } from '~/utils/domain/date'

// A real YYYY-MM-DD date within sane calendar bounds. Replaces a bare regex so a
// crafted import can't smuggle in an out-of-range date that drives unbounded
// date-range generation (issue #1, SEC-09).
const dateKeySchema = z.string().refine(isValidDateKey, 'Invalid or out-of-range date')

// An inclusive pause range. `end >= start` is enforced so a reversed range can't
// silently widen — invalid pauses fail validation and the payload falls back to
// empty state (ADR-0010).
const HabitPauseSchema = z
  .object({
    start: dateKeySchema,
    end: dateKeySchema,
  })
  .refine(pause => compareDateKeys(pause.start, pause.end) <= 0, {
    message: 'Pause end must be on or after start',
  })

// ── V1 input schema (migration input only) ───────────────────────────────────
// The pre-V2 habit shape, without `pauses`. Kept so a stored V1 payload (or a
// legacy localStorage payload) can be validated before being migrated up.

const HabitV1Schema = z.object({
  id: z.string().min(1).max(FIELD_LIMITS.id),
  name: z.string().min(1).max(FIELD_LIMITS.name),
  type: z.enum(['build', 'break']),
  identityStatement: z.string().min(1).max(FIELD_LIMITS.identity),
  scheduleWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(COLLECTION_LIMITS.scheduleWeekdays),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  startDate: dateKeySchema,
  archived: z.boolean(),
  createdAt: z.string().min(1).max(FIELD_LIMITS.timestamp),
  updatedAt: z.string().min(1).max(FIELD_LIMITS.timestamp),
})

// ── V2 schemas (current shape) ───────────────────────────────────────────────

const HabitSchema = HabitV1Schema.extend({
  pauses: z.array(HabitPauseSchema).max(COLLECTION_LIMITS.pausesPerHabit),
})

const HabitEntrySchema = z.object({
  id: z.string().min(1).max(FIELD_LIMITS.id),
  habitId: z.string().min(1).max(FIELD_LIMITS.id),
  date: dateKeySchema,
  status: z.enum(['done', 'missed', 'skipped']),
  completedAt: z.string().min(1).max(FIELD_LIMITS.timestamp).nullable(),
  missReasonCode: z.enum(MISS_REASON_CODES).nullable(),
  missReasonNote: z.string().max(FIELD_LIMITS.note).nullable(),
})

const CoachingSuggestionSchema = z.object({
  id: z.string().min(1).max(FIELD_LIMITS.id),
  entryId: z.string().min(1).max(FIELD_LIMITS.id),
  law: z.enum(['obvious', 'attractive', 'easy', 'satisfying']),
  direction: z.enum(['increase', 'decrease']),
  title: z.string().min(1).max(FIELD_LIMITS.suggestionText),
  action: z.string().min(1).max(FIELD_LIMITS.suggestionText),
  rationale: z.string().min(1).max(FIELD_LIMITS.suggestionText),
  createdAt: z.string().min(1).max(FIELD_LIMITS.timestamp),
})

const SettingsSchema = z.object({
  notificationsEnabled: z.boolean(),
  dailyReviewTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  primaryColor: z.enum(PRIMARY_COLOR_OPTIONS).default(DEFAULT_SETTINGS.primaryColor),
  // Optional + defaulted so pre-issue-#8 payloads (which omit these) stay valid and
  // back-compatible without a schemaVersion bump. lastExportedAt is an ISO timestamp;
  // backupNudgeSnoozedUntil is a YYYY-MM-DD date key.
  lastExportedAt: z.string().max(FIELD_LIMITS.timestamp).nullable().default(null),
  backupNudgeSnoozedUntil: dateKeySchema.nullable().default(null),
})

// The non-habit tables are identical across V1 and V2.
const AppDataV1Schema = z.object({
  schemaVersion: z.literal(1),
  habits: z.array(HabitV1Schema).max(COLLECTION_LIMITS.habits),
  entries: z.array(HabitEntrySchema).max(COLLECTION_LIMITS.entries),
  suggestions: z.array(CoachingSuggestionSchema).max(COLLECTION_LIMITS.suggestions),
  settings: SettingsSchema,
})

export const AppDataV2Schema = z.object({
  schemaVersion: z.literal(APP_DATA_SCHEMA_VERSION),
  habits: z.array(HabitSchema).max(COLLECTION_LIMITS.habits),
  entries: z.array(HabitEntrySchema).max(COLLECTION_LIMITS.entries),
  suggestions: z.array(CoachingSuggestionSchema).max(COLLECTION_LIMITS.suggestions),
  settings: SettingsSchema,
})

type AppDataV1Parsed = z.output<typeof AppDataV1Schema>

/**
 * Upgrade a validated V1 envelope to V2 by defaulting `pauses: []` on every
 * habit and bumping the version. Pure, non-destructive, and idempotent — the
 * one-way migration seam described in ADR-0010 (no V2→V1 down-path).
 */
export function migrateToV2(v1: AppDataV1Parsed): AppDataV2 {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits: v1.habits.map(habit => ({ ...habit, pauses: [] })),
    entries: v1.entries,
    suggestions: v1.suggestions,
    settings: v1.settings,
  }
}

export function createEmptyAppData(): AppDataV2 {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits: [],
    entries: [],
    suggestions: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

/**
 * Cheap raw-count guard for a single habit-like value's nested arrays. Rejects an
 * over-limit `scheduleWeekdays` or `pauses` array by *raw* length — before any
 * deduplication, filtering, or migration — so an over-large payload is thrown out
 * as a unit rather than silently trimmed (issue #35). Non-array members are left
 * for the existing element-level validation/normalization to handle.
 */
export function assertRawHabitNestedLimits(rawHabit: unknown): void {
  if (!rawHabit || typeof rawHabit !== 'object') {
    return
  }

  const candidate = rawHabit as { scheduleWeekdays?: unknown, pauses?: unknown }

  if (
    Array.isArray(candidate.scheduleWeekdays)
    && candidate.scheduleWeekdays.length > COLLECTION_LIMITS.scheduleWeekdays
  ) {
    throw new Error('Import rejected: a habit exceeds the scheduleWeekdays limit')
  }

  if (Array.isArray(candidate.pauses) && candidate.pauses.length > COLLECTION_LIMITS.pausesPerHabit) {
    throw new Error('Import rejected: a habit exceeds the pauses limit')
  }
}

/**
 * Cheap raw-count guard for a list of habit-like values. Rejects when the raw list
 * exceeds the habit cap, then checks each raw habit's nested arrays. Shared by the
 * strict preflight and the lenient habits-only import path so neither can become a
 * bypass. Uses *raw* lengths, so 501 duplicate-ID habits are rejected rather than
 * deduplicated to one (issue #35).
 */
export function assertRawHabitLimits(rawHabits: unknown[]): void {
  if (rawHabits.length > COLLECTION_LIMITS.habits) {
    throw new Error('Import rejected: habit count exceeds the limit')
  }

  for (const rawHabit of rawHabits) {
    assertRawHabitNestedLimits(rawHabit)
  }
}

/**
 * Cheap preflight over an arbitrary payload's raw top-level collections and nested
 * habit arrays, run before the expensive Zod parse traverses every element. Rejects
 * obviously oversized input up front; only after confirming `habits.length` is within
 * cap does it scan those at-most-500 raw habits. Non-array members are ignored here
 * and fail later through the normal Zod/type checks (issue #35).
 */
function assertRawCollectionLimits(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    return
  }

  const candidate = payload as { habits?: unknown, entries?: unknown, suggestions?: unknown }

  if (Array.isArray(candidate.entries) && candidate.entries.length > COLLECTION_LIMITS.entries) {
    throw new Error('Import rejected: entry count exceeds the limit')
  }

  if (Array.isArray(candidate.suggestions) && candidate.suggestions.length > COLLECTION_LIMITS.suggestions) {
    throw new Error('Import rejected: suggestion count exceeds the limit')
  }

  if (Array.isArray(candidate.habits)) {
    assertRawHabitLimits(candidate.habits)
  }
}

/**
 * Validate and (if needed) migrate an arbitrary persisted/imported payload to
 * the current {@link AppDataV2} shape.
 *
 * - `schemaVersion === 2` → validate as V2.
 * - `schemaVersion === 1` (or missing/legacy) → normalise to `schemaVersion: 1`,
 *   validate as V1, then {@link migrateToV2} and re-validate as V2.
 *
 * Invalid input throws; callers (Dexie load, importers) catch and fall back to
 * {@link createEmptyAppData}.
 */
export function parseAppData(payload: unknown): AppDataV2 {
  // Cheap raw-count preflight: reject an obviously oversized payload before Zod
  // traverses (and the migration copies) every element (issue #35).
  assertRawCollectionLimits(payload)

  const version
    = payload && typeof payload === 'object'
      ? (payload as { schemaVersion?: unknown }).schemaVersion
      : undefined

  if (version === APP_DATA_SCHEMA_VERSION) {
    return AppDataV2Schema.parse(payload)
  }

  // Migrate only V1 input: an explicit `schemaVersion: 1`, or a legacy payload
  // with a missing/non-numeric version (normalised to 1 below). Any *other*
  // explicit version (e.g. a future or bogus 99) is rejected so callers fall
  // back to empty state rather than silently mis-migrating.
  const isMigratableV1 = version === 1 || version === undefined

  if (!isMigratableV1) {
    throw new Error(`Unsupported schemaVersion: ${String(version)}`)
  }

  const candidate
    = payload && typeof payload === 'object'
      ? { ...(payload as object), schemaVersion: 1 }
      : payload

  const v1 = AppDataV1Schema.parse(candidate)
  return AppDataV2Schema.parse(migrateToV2(v1))
}

/**
 * Normalise an arbitrary habit-like value's `pauses` into a clean, validated
 * `HabitPause[]` (dropping invalid ranges). Used by the lenient import path in
 * settings, which builds habits field-by-field rather than through Zod.
 */
export function normalizeHabitPauses(value: unknown): Habit['pauses'] {
  if (!Array.isArray(value)) {
    return []
  }

  // Defensively reject an over-limit raw array so a direct future caller can't
  // bypass the pause cap by skipping the import preflight (issue #35).
  if (value.length > COLLECTION_LIMITS.pausesPerHabit) {
    throw new Error('Import rejected: a habit exceeds the pauses limit')
  }

  const pauses: Habit['pauses'] = []
  for (const item of value) {
    const result = HabitPauseSchema.safeParse(item)
    if (result.success) {
      pauses.push(result.data)
    }
  }

  return pauses
}
