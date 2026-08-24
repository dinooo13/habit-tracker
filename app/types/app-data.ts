export const APP_DATA_SCHEMA_VERSION = 2 as const

export type HabitType = 'build' | 'break'
export type HabitStatus = 'done' | 'missed' | 'skipped'
export const PRIMARY_COLOR_OPTIONS = ['sky', 'emerald', 'violet', 'rose', 'amber'] as const
export type PrimaryColor = (typeof PRIMARY_COLOR_OPTIONS)[number]

export const MISS_REASON_CODES = [
  'forgot',
  'no_time',
  'low_motivation',
  'too_hard',
  'bad_environment',
  'no_immediate_reward',
  'social_pressure',
  'other',
] as const

export type MissReasonCode = (typeof MISS_REASON_CODES)[number]

// Maximum lengths for user-controlled string fields. Enforced by both the strict
// and lenient import Zod schemas (storage-schema.ts) to keep a crafted import from
// exhausting storage or degrading the UI (issue #1, SEC-06).
export const FIELD_LIMITS = {
  id: 100,
  name: 200,
  identity: 500,
  note: 1000,
  suggestionText: 500,
  timestamp: 64,
} as const

// Hard ceiling on the size of an imported JSON file, checked against `File.size`
// before the file is ever read into memory. Bounds the string allocation and JSON
// parse cost so a crafted or accidental huge file can't freeze the tab before
// validation runs (issue #35). Files exactly at the limit remain eligible.
export const MAX_IMPORT_FILE_BYTES = 64 * 1024 * 1024

// Maximum element counts for the persisted/imported collections and their nested
// arrays. Enforced by the Zod schema, a cheap raw-count preflight, and the lenient
// habits-only import path so an over-large payload is rejected as a unit before any
// expensive per-element work (issue #35). Caps apply to raw array length, before
// deduplication, invalid-item filtering, or migration. Values are generous so no
// legitimate personal history is rejected. Length <= cap continues; > cap is rejected.
export const COLLECTION_LIMITS = {
  habits: 500,
  entries: 200_000,
  suggestions: 400_000,
  scheduleWeekdays: 7,
  pausesPerHabit: 100,
} as const

/**
 * An inclusive range of local date keys (`YYYY-MM-DD`) during which a habit is
 * paused. Days inside a pause are never *due*, so they are excluded from the
 * queue and never auto-marked `missed`. Both bounds are inclusive; `end >= start`.
 */
export interface HabitPause {
  start: string
  end: string
}

export interface Habit {
  id: string
  name: string
  type: HabitType
  identityStatement: string
  scheduleWeekdays: number[]
  reminderTime: string | null
  startDate: string
  archived: boolean
  pauses: HabitPause[]
  createdAt: string
  updatedAt: string
}

export interface HabitEntry {
  id: string
  habitId: string
  date: string
  status: HabitStatus
  completedAt: string | null
  missReasonCode: MissReasonCode | null
  missReasonNote: string | null
}

export type AtomicLaw = 'obvious' | 'attractive' | 'easy' | 'satisfying'
export type LawDirection = 'increase' | 'decrease'

export interface CoachingSuggestion {
  id: string
  entryId: string
  law: AtomicLaw
  direction: LawDirection
  title: string
  action: string
  rationale: string
  createdAt: string
}

export interface AppSettings {
  notificationsEnabled: boolean
  dailyReviewTime: string | null
  weekStartsOn: 0 | 1
  primaryColor: PrimaryColor
  // ISO timestamp of the most recent successful export, or null if never exported.
  // Anchors the "unexported data" backup nudge (issue #8).
  lastExportedAt: string | null
  // Date key (YYYY-MM-DD) the backup nudge is snoozed until after a dismissal, or null.
  backupNudgeSnoozedUntil: string | null
}

// Backup-nudge thresholds (issue #8). Show the dashboard nudge once data has gone
// unexported for at least this many weeks; snooze it this many days on dismissal.
export const BACKUP_NUDGE_THRESHOLD_WEEKS = 2
export const BACKUP_NUDGE_SNOOZE_DAYS = 7

/**
 * The current persisted envelope. The only shape change from V1 is the new
 * `pauses` field on `Habit`; see ADR-0010 and `migrateToV2` in
 * `app/utils/persistence/storage-schema.ts`.
 */
export interface AppDataV2 {
  schemaVersion: typeof APP_DATA_SCHEMA_VERSION
  habits: Habit[]
  entries: HabitEntry[]
  suggestions: CoachingSuggestion[]
  settings: AppSettings
}

/** The current envelope type. Aliased so consumers can use a version-agnostic name. */
export type AppData = AppDataV2

export interface HabitCreateInput {
  name: string
  type: HabitType
  identityStatement: string
  scheduleWeekdays: number[]
  reminderTime: string | null
  startDate: string
  pauses?: HabitPause[]
}

export interface HabitUpdateInput extends HabitCreateInput {
  archived: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  notificationsEnabled: false,
  dailyReviewTime: '20:00',
  weekStartsOn: 1,
  primaryColor: 'emerald',
  lastExportedAt: null,
  backupNudgeSnoozedUntil: null,
}
