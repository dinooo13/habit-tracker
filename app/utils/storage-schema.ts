import { z } from 'zod'
import {
  APP_DATA_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  MISS_REASON_CODES,
  type AppDataV1
} from '~/types/app-data'

const HabitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['build', 'break']),
  identityStatement: z.string().min(1),
  scheduleWeekdays: z.array(z.number().int().min(0).max(6)).min(1),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  archived: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
})

const HabitEntrySchema = z.object({
  id: z.string().min(1),
  habitId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['done', 'missed', 'skipped']),
  completedAt: z.string().min(1).nullable(),
  missReasonCode: z.enum(MISS_REASON_CODES).nullable(),
  missReasonNote: z.string().nullable()
})

const CoachingSuggestionSchema = z.object({
  id: z.string().min(1),
  entryId: z.string().min(1),
  law: z.enum(['obvious', 'attractive', 'easy', 'satisfying']),
  direction: z.enum(['increase', 'decrease']),
  title: z.string().min(1),
  action: z.string().min(1),
  rationale: z.string().min(1),
  createdAt: z.string().min(1)
})

const SettingsSchema = z.object({
  notificationsEnabled: z.boolean(),
  dailyReviewTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)])
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
