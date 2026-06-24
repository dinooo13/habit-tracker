import { z } from 'zod'
import {
  APP_DATA_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  FIELD_LIMITS,
  MISS_REASON_CODES,
  PRIMARY_COLOR_OPTIONS,
  type AppDataV2,
  type Habit
} from '~/types/app-data'
import { compareDateKeys, isValidDateKey } from '~/utils/date'

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
    end: dateKeySchema
  })
  .refine((pause) => compareDateKeys(pause.start, pause.end) <= 0, {
    message: 'Pause end must be on or after start'
  })

// ── V1 input schema (migration input only) ───────────────────────────────────
// The pre-V2 habit shape, without `pauses`. Kept so a stored V1 payload (or a
// legacy localStorage payload) can be validated before being migrated up.

const HabitV1Schema = z.object({
  id: z.string().min(1).max(FIELD_LIMITS.id),
  name: z.string().min(1).max(FIELD_LIMITS.name),
  type: z.enum(['build', 'break']),
  identityStatement: z.string().min(1).max(FIELD_LIMITS.identity),
  scheduleWeekdays: z.array(z.number().int().min(0).max(6)).min(1),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  startDate: dateKeySchema,
  archived: z.boolean(),
  createdAt: z.string().min(1).max(FIELD_LIMITS.timestamp),
  updatedAt: z.string().min(1).max(FIELD_LIMITS.timestamp)
})

// ── V2 schemas (current shape) ───────────────────────────────────────────────

const HabitSchema = HabitV1Schema.extend({
  pauses: z.array(HabitPauseSchema)
})

const HabitEntrySchema = z.object({
  id: z.string().min(1).max(FIELD_LIMITS.id),
  habitId: z.string().min(1).max(FIELD_LIMITS.id),
  date: dateKeySchema,
  status: z.enum(['done', 'missed', 'skipped']),
  completedAt: z.string().min(1).max(FIELD_LIMITS.timestamp).nullable(),
  missReasonCode: z.enum(MISS_REASON_CODES).nullable(),
  missReasonNote: z.string().max(FIELD_LIMITS.note).nullable()
})

const CoachingSuggestionSchema = z.object({
  id: z.string().min(1).max(FIELD_LIMITS.id),
  entryId: z.string().min(1).max(FIELD_LIMITS.id),
  law: z.enum(['obvious', 'attractive', 'easy', 'satisfying']),
  direction: z.enum(['increase', 'decrease']),
  title: z.string().min(1).max(FIELD_LIMITS.suggestionText),
  action: z.string().min(1).max(FIELD_LIMITS.suggestionText),
  rationale: z.string().min(1).max(FIELD_LIMITS.suggestionText),
  createdAt: z.string().min(1).max(FIELD_LIMITS.timestamp)
})

const SettingsSchema = z.object({
  notificationsEnabled: z.boolean(),
  dailyReviewTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  primaryColor: z.enum(PRIMARY_COLOR_OPTIONS).default(DEFAULT_SETTINGS.primaryColor)
})

// The non-habit tables are identical across V1 and V2.
const AppDataV1Schema = z.object({
  schemaVersion: z.literal(1),
  habits: z.array(HabitV1Schema),
  entries: z.array(HabitEntrySchema),
  suggestions: z.array(CoachingSuggestionSchema),
  settings: SettingsSchema
})

export const AppDataV2Schema = z.object({
  schemaVersion: z.literal(APP_DATA_SCHEMA_VERSION),
  habits: z.array(HabitSchema),
  entries: z.array(HabitEntrySchema),
  suggestions: z.array(CoachingSuggestionSchema),
  settings: SettingsSchema
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
    habits: v1.habits.map((habit) => ({ ...habit, pauses: [] })),
    entries: v1.entries,
    suggestions: v1.suggestions,
    settings: v1.settings
  }
}

export function createEmptyAppData(): AppDataV2 {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits: [],
    entries: [],
    suggestions: [],
    settings: { ...DEFAULT_SETTINGS }
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
  const version =
    payload && typeof payload === 'object'
      ? (payload as { schemaVersion?: unknown }).schemaVersion
      : undefined

  if (version === APP_DATA_SCHEMA_VERSION) {
    return AppDataV2Schema.parse(payload)
  }

  // Treat anything that isn't an explicit V2 as V1-shaped input. A payload with
  // a missing/legacy version is normalised to `schemaVersion: 1` before the V1
  // schema (which pins the literal) runs.
  const candidate =
    payload && typeof payload === 'object'
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

  const pauses: Habit['pauses'] = []
  for (const item of value) {
    const result = HabitPauseSchema.safeParse(item)
    if (result.success) {
      pauses.push(result.data)
    }
  }

  return pauses
}
