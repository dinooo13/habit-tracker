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
import { compareDateKeys, isValidDateKey, nowIso, todayDateKey } from '~/utils/domain/date'
import { createId } from '~/utils/domain/id'
import {
  assertMigrationRegistryInvariants,
  runMigrationChain,
  type MigrationStep,
} from '~/utils/persistence/schema-migrations'

// A real YYYY-MM-DD date within sane calendar bounds. Replaces a bare regex so a
// crafted import can't smuggle in an out-of-range date that drives unbounded
// date-range generation (issue #1, SEC-09).
const dateKeySchema = z.string().refine(isValidDateKey, 'Invalid or out-of-range date')

// The single source of truth for a valid `HH:mm` 24-hour time string. Shared by the
// strict habit/settings schemas and the lenient import schema so a crafted import
// can't get past a divergent copy (this replaced a hand-rolled duplicate that lived
// in settings.vue — issue #69).
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

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
    .regex(TIME_REGEX)
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

// ── Lenient habit import schema (issue #69) ──────────────────────────────────
// A forgiving counterpart to the strict `HabitSchema`, used only by the
// habits-only import path (AI-generated / hand-edited habit lists). It replaces
// the ~65-line hand-rolled `normalizeImportedHabit()` that used to live in
// `settings.vue` — a shadow validator that re-implemented the Habit shape (and
// carried its own copy of the time regex), and so would have silently dropped any
// field added to `Habit` later.
//
// Contract, matching the old normalizer exactly:
//   - The four fields a habit cannot be reconstructed without — `name`, `type`,
//     `identityStatement`, `scheduleWeekdays` — have NO fallback: a bad value
//     fails the item, so `parseLenientHabit` returns null and the caller drops it
//     (the old `return null`).
//   - Every other field is coerced/`.catch()`-ed to a safe default rather than
//     failing the whole item, so a partial habit still imports.
//   - `scheduleWeekdays` keeps the old lenient behavior: filter to valid 0–6
//     integers, dedupe, and sort, then require at least one (drop the item if none
//     survive) and cap at the schedule limit.
//   - `pauses` reuses `HabitPauseSchema` and falls back to `[]` (the raw preflight
//     `assertRawHabitLimits` still rejects an over-cap pauses array as a unit
//     upstream — issue #35), replacing the separate `normalizeHabitPauses` path.
const LenientHabitImportSchema = z.object({
  id: z.string().min(1).max(FIELD_LIMITS.id).catch(() => createId('habit')),
  name: z.string().trim().min(1).max(FIELD_LIMITS.name),
  type: z.enum(['build', 'break']),
  identityStatement: z.string().trim().min(1).max(FIELD_LIMITS.identity),
  scheduleWeekdays: z.preprocess(
    value =>
      Array.isArray(value)
        ? [...new Set(value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort(
            (left, right) => left - right,
          )
        : value,
    z.array(z.number().int().min(0).max(6)).min(1).max(COLLECTION_LIMITS.scheduleWeekdays),
  ),
  reminderTime: z.string().regex(TIME_REGEX).nullable().catch(null),
  startDate: dateKeySchema.catch(() => todayDateKey()),
  archived: z.boolean().catch(false),
  pauses: z.array(HabitPauseSchema).max(COLLECTION_LIMITS.pausesPerHabit).catch([]),
  createdAt: z.string().min(1).max(FIELD_LIMITS.timestamp).catch(() => nowIso()),
  updatedAt: z.string().min(1).max(FIELD_LIMITS.timestamp).catch(() => nowIso()),
}) satisfies z.ZodType<Habit>

// Compile-time anchor: the lenient schema must cover exactly the strict habit
// keys. If a field is ever added to `HabitSchema` (and thus `Habit`) without a
// matching lenient rule here, this assignment fails to type-check — forcing a
// deliberate lenient decision rather than a silent drop (the exact failure mode
// issue #69 set out to kill).
type StrictHabitKeys = keyof typeof HabitSchema.shape
type LenientHabitKeys = keyof typeof LenientHabitImportSchema.shape
type AssertSameKeys<A extends string, B extends string> = [A] extends [B]
  ? [B] extends [A]
      ? true
      : never
  : never
const _lenientHabitKeyCoverage: AssertSameKeys<StrictHabitKeys, LenientHabitKeys> = true
void _lenientHabitKeyCoverage

export { LenientHabitImportSchema }

/**
 * Validate a single raw, untrusted habit-like value from a habits-only import
 * through {@link LenientHabitImportSchema}. Returns a clean {@link Habit} on
 * success, or `null` when a required field is missing/invalid (so the caller
 * drops the item). Never throws — the pause/schedule caps are enforced by the
 * raw preflight (`assertRawHabitLimits`) before this runs.
 */
export function parseLenientHabit(raw: unknown): Habit | null {
  const result = LenientHabitImportSchema.safeParse(raw)
  return result.success ? result.data : null
}

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
    .regex(TIME_REGEX)
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

// ── Version-keyed migration registry (issue #68, ADR-0022) ───────────────────
// The bespoke V1→V2 branch is now one entry in a registry keyed by source
// version. A future V3 is another entry — not another `if` in `parseAppData`.
// The generic walker lives in `schema-migrations.ts`; the registry *data* stays
// here (it needs `AppDataV1Schema` + `migrateToV2`), and the engine takes the
// registry as an argument, so there is no import cycle.

/**
 * Normalise a legacy payload's `schemaVersion` to `1` before V1 validation. A
 * missing/`null` version (pre-Dexie `localStorage`) is treated as V1; a
 * *present* unrecognised version never reaches here (it resolves to
 * `unsupported-version` first), so this only ever stamps a `1`. Non-object
 * payloads pass through untouched to fail V1 validation as `invalid-shape`.
 */
function normalizeLegacyVersion(payload: unknown): unknown {
  return payload && typeof payload === 'object'
    ? { ...(payload as object), schemaVersion: 1 }
    : payload
}

const V1_TO_V2: MigrationStep = {
  id: 'v1->v2',
  from: 1,
  to: APP_DATA_SCHEMA_VERSION,
  // Validate the input as a V1 envelope (throwing on a bad shape, which the
  // engine captures), then upgrade it. The engine re-validates the output
  // against the current schema, so a buggy step can never reach a store.
  migrate: raw => migrateToV2(AppDataV1Schema.parse(normalizeLegacyVersion(raw))),
}

/** Migration steps keyed by the source version each consumes. */
export const SCHEMA_MIGRATIONS: ReadonlyMap<number, MigrationStep> = new Map([[V1_TO_V2.from, V1_TO_V2]])

// Fail fast at module load if the chain is ever mis-edited (a hole, a duplicate,
// or a step that skips a version), rather than silently mis-migrating at runtime.
assertMigrationRegistryInvariants(SCHEMA_MIGRATIONS)

// ── Discriminated parse result (issue #68, ADR-0022) ─────────────────────────

/** Why a payload could not be turned into current-shape {@link AppDataV2}. */
export type ParseFailureReason
  = | 'oversized' // raw-count preflight rejected it (issue #35)
    | 'unsupported-version' // no migration path from the stored version
    | 'invalid-shape' // a Zod parse (V1 input or final V2 output) failed
    | 'migration-failed' // a registry step threw for a non-validation reason

/**
 * The outcome of validating/migrating an untrusted payload. `ok`/`migrated`
 * carry clean {@link AppDataV2}; `unrecoverable` carries a human-readable
 * `message` (rendered by the recovery banner) and a machine-readable `reason`.
 */
export type ParseAppDataResult
  = | { status: 'ok', data: AppDataV2, sourceVersion: number }
    | { status: 'migrated', data: AppDataV2, sourceVersion: number, steps: string[] }
    | { status: 'unrecoverable', reason: ParseFailureReason, message: string, sourceVersion: unknown }

function rawSchemaVersion(payload: unknown): unknown {
  return payload && typeof payload === 'object'
    ? (payload as { schemaVersion?: unknown }).schemaVersion
    : undefined
}

/**
 * Resolve the source schema version to migrate *from*, or `null` when the stored
 * version is present but unrecognised. Only an absent/`null` version is treated
 * as legacy V1 — a *present* value that is not `1`/`2` (including the string
 * `'2'`, `99`, `1.5`, `NaN`, or an object) is unrecoverable, so a non-V1 payload
 * can never be coerced through the V1 schema (which would silently strip
 * `pauses`). See §3.2 of the plan.
 */
function resolveSourceVersion(payload: unknown): number | null {
  const version = rawSchemaVersion(payload)
  if (version === APP_DATA_SCHEMA_VERSION) {
    return APP_DATA_SCHEMA_VERSION
  }
  if (version === 1 || version === undefined || version === null) {
    return 1
  }
  return null
}

const INVALID_SHAPE_MESSAGE = 'Stored data does not match the expected AppData shape and cannot be read.'

/**
 * Validate and (if needed) migrate an arbitrary persisted/imported payload to
 * the current {@link AppDataV2} shape, returning a discriminated result. **Never
 * throws** — it is the single source of truth for turning an untrusted payload
 * into app data, and the adapter/importers branch on `status` rather than
 * catching (issue #68, ADR-0022).
 */
export function parseAppDataResult(payload: unknown): ParseAppDataResult {
  // Cheap raw-count preflight first (issue #35): reject an obviously oversized
  // payload before Zod traverses (and the migration copies) every element.
  try {
    assertRawCollectionLimits(payload)
  }
  catch (error) {
    return {
      status: 'unrecoverable',
      reason: 'oversized',
      message: error instanceof Error ? error.message : 'Stored data exceeds the allowed size limits.',
      sourceVersion: rawSchemaVersion(payload),
    }
  }

  const sourceVersion = resolveSourceVersion(payload)

  if (sourceVersion === null) {
    return {
      status: 'unrecoverable',
      reason: 'unsupported-version',
      message: `Stored data uses schemaVersion ${String(rawSchemaVersion(payload))}, which this app version cannot read (supported: 1–${APP_DATA_SCHEMA_VERSION}).`,
      sourceVersion: rawSchemaVersion(payload),
    }
  }

  if (sourceVersion === APP_DATA_SCHEMA_VERSION) {
    const parsed = AppDataV2Schema.safeParse(payload)
    return parsed.success
      ? { status: 'ok', data: parsed.data, sourceVersion: APP_DATA_SCHEMA_VERSION }
      : { status: 'unrecoverable', reason: 'invalid-shape', message: INVALID_SHAPE_MESSAGE, sourceVersion: APP_DATA_SCHEMA_VERSION }
  }

  const chain = runMigrationChain(payload, sourceVersion, APP_DATA_SCHEMA_VERSION, SCHEMA_MIGRATIONS)

  if (!chain.ok) {
    // No step registered for a version (shouldn't happen for a resolved V1, but
    // defended) → unsupported; a Zod throw from a step → invalid input shape;
    // any other throw → a genuine migration bug.
    if (chain.failedStepId === null) {
      return {
        status: 'unrecoverable',
        reason: 'unsupported-version',
        message: `Stored data uses schemaVersion ${String(rawSchemaVersion(payload))}, which this app version cannot read (supported: 1–${APP_DATA_SCHEMA_VERSION}).`,
        sourceVersion: rawSchemaVersion(payload),
      }
    }
    if (chain.error instanceof z.ZodError) {
      return { status: 'unrecoverable', reason: 'invalid-shape', message: INVALID_SHAPE_MESSAGE, sourceVersion }
    }
    return {
      status: 'unrecoverable',
      reason: 'migration-failed',
      message: `Stored data could not be upgraded from schemaVersion ${sourceVersion}.`,
      sourceVersion,
    }
  }

  const parsed = AppDataV2Schema.safeParse(chain.payload)
  return parsed.success
    ? { status: 'migrated', data: parsed.data, sourceVersion, steps: chain.steps }
    : { status: 'unrecoverable', reason: 'invalid-shape', message: INVALID_SHAPE_MESSAGE, sourceVersion }
}

/**
 * Validate and (if needed) migrate an arbitrary persisted/imported payload to
 * the current {@link AppDataV2} shape. Thin throwing wrapper over
 * {@link parseAppDataResult}: invalid input throws; callers that want a value or
 * an exception (demo fetch, the legacy fallbacks' inner attempt) use this, while
 * the adapter and settings import branch on the result directly.
 */
export function parseAppData(payload: unknown): AppDataV2 {
  const result = parseAppDataResult(payload)
  if (result.status === 'unrecoverable') {
    throw new Error(result.message)
  }
  return result.data
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
