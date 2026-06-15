import { z } from 'zod'
import {
  APP_DATA_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  FIELD_LIMITS,
  MISS_REASON_CODES,
  PRIMARY_COLOR_OPTIONS,
  type AppDataV1
} from '~/types/app-data'
import { isValidDateKey } from '~/utils/date'

// A real YYYY-MM-DD date within sane calendar bounds. Replaces a bare regex so a
// crafted import can't smuggle in an out-of-range date that drives unbounded
// date-range generation (issue #1, SEC-09).
const dateKeySchema = z.string().refine(isValidDateKey, 'Invalid or out-of-range date')

const HabitSchema = z.object({
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

export const AppDataV1Schema = z.object({
  schemaVersion: z.literal(APP_DATA_SCHEMA_VERSION),
  habits: z.array(HabitSchema),
  entries: z.array(HabitEntrySchema),
  suggestions: z.array(CoachingSuggestionSchema),
  settings: SettingsSchema
})

export function createEmptyAppData(): AppDataV1 {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits: [],
    entries: [],
    suggestions: [],
    settings: { ...DEFAULT_SETTINGS }
  }
}

export function parseAppData(payload: unknown): AppDataV1 {
  return AppDataV1Schema.parse(payload)
}
