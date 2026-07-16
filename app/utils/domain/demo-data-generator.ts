import type { AppData, CoachingSuggestion, Habit, HabitEntry, MissReasonCode } from '~/types/app-data'
import { APP_DATA_SCHEMA_VERSION } from '~/types/app-data'
import { generateSuggestionsForMissedEntry } from '~/utils/domain/atomic-rules'

// ── date helpers ──────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function dateToIso(d: Date, hhmmssfff = '00:00:00.000'): string {
  return `${dateToKey(d)}T${hhmmssfff}Z`
}

function shiftDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function shiftMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

// ── deterministic RNG (LCG) ───────────────────────────────────────────────────
// Seeded by today's date so the same day always yields the same demo dataset.

function makeLcg(seed: number) {
  let s = (seed >>> 0) || 1
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ── habit definitions ─────────────────────────────────────────────────────────

interface HabitDef {
  id: string
  name: string
  type: 'build' | 'break'
  identityStatement: string
  scheduleWeekdays: number[] // 0 = Sun … 6 = Sat (JS getDay convention)
  reminderTime: string // HH:MM
  startOffsetDays: number // days after periodStart the habit was created
  successRates: [number, number, number] // phase 0 / 1 / 2
}

const HABIT_DEFS: HabitDef[] = [
  {
    id: 'habit_reading',
    name: 'Read 20 pages',
    type: 'build',
    identityStatement: 'I am a daily learner.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: '21:00',
    startOffsetDays: 0,
    successRates: [0.60, 0.74, 0.85],
  },
  {
    id: 'habit_morning_run',
    name: 'Morning run',
    type: 'build',
    identityStatement: 'I am an active person.',
    scheduleWeekdays: [1, 3, 5], // Mon Wed Fri
    reminderTime: '07:00',
    startOffsetDays: 6,
    successRates: [0.70, 0.83, 0.91],
  },
  {
    id: 'habit_no_snacks',
    name: 'No late-night snacks',
    type: 'break',
    identityStatement: 'I protect my energy and sleep.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: '20:30',
    startOffsetDays: 6,
    successRates: [0.68, 0.79, 0.89],
  },
  {
    id: 'habit_social_media_limit',
    name: 'No social media before 18:00',
    type: 'break',
    identityStatement: 'I control my attention.',
    scheduleWeekdays: [1, 2, 3, 4, 5], // Mon–Fri
    reminderTime: '18:00',
    startOffsetDays: 12,
    successRates: [0.62, 0.75, 0.86],
  },
  {
    id: 'habit_meditation',
    name: '10-minute meditation',
    type: 'build',
    identityStatement: 'I am calm and focused.',
    scheduleWeekdays: [1, 2, 3, 4, 5],
    reminderTime: '08:30',
    startOffsetDays: 16,
    successRates: [0.65, 0.80, 0.92],
  },
  {
    id: 'habit_water_intake',
    name: 'Drink 8 glasses of water',
    type: 'build',
    identityStatement: 'I am well-hydrated and energised.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: '12:00',
    startOffsetDays: 57,
    successRates: [0.82, 0.82, 0.91],
  },
  {
    id: 'habit_journaling',
    name: 'Evening journal',
    type: 'build',
    identityStatement: 'I am self-aware and reflective.',
    scheduleWeekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTime: '22:00',
    startOffsetDays: 71,
    successRates: [0.74, 0.74, 0.87],
  },
]

// ── miss-reason pools ─────────────────────────────────────────────────────────

const MISS_REASONS: Record<string, Array<[MissReasonCode, string]>> = {
  habit_morning_run: [
    ['no_time', 'Had to catch an early train — no time to run.'],
    ['low_motivation', 'Dark and cold outside, couldn\'t bring myself to go.'],
    ['too_hard', 'Still sore from the last session.'],
    ['forgot', 'Set the wrong alarm and missed the run window.'],
    ['bad_environment', 'Rain was too heavy to run safely.'],
    ['other', 'Forgot about an early work call.'],
    ['no_time', 'Family commitment took the whole morning.'],
    ['low_motivation', 'Just couldn\'t get out of bed today.'],
    ['bad_environment', 'Icy pavements — didn\'t want to risk a fall.'],
    ['social_pressure', 'Slept at a friend\'s, routine completely disrupted.'],
  ],
  habit_reading: [
    ['no_time', 'Work ran late and I was too tired to read.'],
    ['low_motivation', 'Got distracted by a show I wanted to finish.'],
    ['too_hard', 'The book is getting dense — hard to push through.'],
    ['forgot', 'Fell asleep before picking up the book.'],
    ['bad_environment', 'Too noisy at home to concentrate.'],
    ['social_pressure', 'Friends came over and the evening disappeared.'],
    ['other', 'Finished one book and hadn\'t started the next yet.'],
    ['no_immediate_reward', 'Hard to feel progress on slow, heavy chapters.'],
    ['no_time', 'Long commute then dinner — no evening left.'],
    ['low_motivation', 'Wasn\'t in the right headspace for reading.'],
  ],
  habit_no_snacks: [
    ['bad_environment', 'Friend brought snacks over, hard to say no.'],
    ['social_pressure', 'Birthday party — cake was non-negotiable.'],
    ['no_immediate_reward', 'Was restless and snacking calmed me down.'],
    ['low_motivation', 'Long day — rewarded myself with crisps.'],
    ['forgot', 'Ate on autopilot before I remembered.'],
    ['other', 'Dinner was too light, got hungry at 11 pm.'],
    ['too_hard', 'Was watching a film and the urge was overwhelming.'],
    ['bad_environment', 'Partner was snacking right next to me all evening.'],
    ['social_pressure', 'Work drinks ran late and snacks were on the table.'],
    ['forgot', 'Mindlessly grabbed something while reading.'],
  ],
  habit_meditation: [
    ['no_time', 'Back-to-back meetings ran into meditation time.'],
    ['bad_environment', 'Kids were too noisy to focus.'],
    ['forgot', 'Got into work flow and forgot until too late.'],
    ['low_motivation', 'Mind was too scattered to even start.'],
    ['too_hard', 'Kept getting interrupted by notifications.'],
    ['other', 'Rushed straight from bed to work — no morning routine.'],
    ['no_immediate_reward', 'Hard to feel the benefit on already-stressed days.'],
    ['social_pressure', 'Guest at home made sitting quietly feel awkward.'],
    ['forgot', 'Was on a call at 8:30 and it slipped my mind after.'],
    ['no_time', 'Early office start — had to skip.'],
  ],
  habit_social_media_limit: [
    ['social_pressure', 'Colleague texted and I opened the app to reply.'],
    ['forgot', 'Opened Twitter on autopilot before 18:00.'],
    ['bad_environment', 'Boring commute — scrolled to pass the time.'],
    ['low_motivation', 'Anxious about the news, felt compelled to check.'],
    ['no_immediate_reward', 'Missed feeling connected during the lunch break.'],
    ['other', 'Had to check a work Slack channel urgently before 18:00.'],
    ['too_hard', 'Phone was right there and the habit kicked in.'],
    ['social_pressure', 'Group chat was blowing up and I didn\'t want to miss it.'],
    ['forgot', 'Checked Instagram while waiting in a queue.'],
    ['bad_environment', 'TV show was boring so I reached for my phone.'],
  ],
  habit_water_intake: [
    ['forgot', 'Was out all day and didn\'t track my intake.'],
    ['no_time', 'So busy I only managed two glasses all day.'],
    ['bad_environment', 'No water bottle with me at the event.'],
    ['low_motivation', 'Just wasn\'t thirsty and didn\'t push myself.'],
    ['other', 'Had a lot of coffee instead — convinced myself it counted.'],
    ['forgot', 'Skipped breakfast and forgot to start tracking.'],
    ['no_immediate_reward', 'Hard to notice a difference from day to day.'],
    ['too_hard', 'Eight glasses feels like a lot when you\'re not thirsty.'],
  ],
  habit_journaling: [
    ['no_time', 'Got to bed far later than planned.'],
    ['low_motivation', 'Nothing noteworthy happened — didn\'t see the point.'],
    ['forgot', 'Fell asleep before I even opened the journal.'],
    ['too_hard', 'Stared at a blank page and gave up after two minutes.'],
    ['bad_environment', 'Room was dark and I didn\'t want to wake my partner.'],
    ['other', 'Thought I\'d do it in the morning — and didn\'t.'],
    ['no_immediate_reward', 'Hard to see the value when the day felt mundane.'],
    ['social_pressure', 'Was on a video call until midnight.'],
  ],
}

// ── constants ─────────────────────────────────────────────────────────────────

const SKIP_RATE = 0.18
const MISS_REASON_RATE = 0.78

// Phase boundaries in days from periodStart.
// Phase 0 (weeks 1–6): struggling to form habits
// Phase 1 (weeks 7–18): building momentum
// Phase 2 (weeks 19–26): strong, consistent execution
const PHASE_1_START = 42
const PHASE_2_START = 126

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Generates a realistic six-month demo dataset anchored to `today`.
 * The same date always produces the same dataset (deterministic RNG).
 */
export function generateDemoData(today = new Date()): AppData {
  const endDate = shiftDays(today, -1) // yesterday — last "completed" day
  const periodStart = shiftMonths(endDate, -6)

  // Seed one example "travel week" pause on the reading habit ~3 months ago so
  // the demo shows the flexible-schedule feature: no missed entries are created
  // for those days (ADR-0010).
  const pauseStart = shiftMonths(endDate, -3)
  const pausesByHabit: Record<string, Array<{ start: string, end: string }>> = {
    habit_reading: [{ start: dateToKey(pauseStart), end: dateToKey(shiftDays(pauseStart, 6)) }],
  }

  function isInDemoPause(habitId: string, dateKey: string): boolean {
    return (pausesByHabit[habitId] ?? []).some(
      pause => dateKey >= pause.start && dateKey <= pause.end,
    )
  }

  // Seed = numeric date so data is stable within a calendar day
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  const rng = makeLcg(seed)

  // Build habit objects with computed dates
  const habits: Habit[] = HABIT_DEFS.map((def) => {
    const habitStart = shiftDays(periodStart, def.startOffsetDays)
    const [hh, mm] = def.reminderTime.split(':')
    const timeStr = `${hh}:${mm}:00.000`
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      identityStatement: def.identityStatement,
      scheduleWeekdays: def.scheduleWeekdays,
      reminderTime: def.reminderTime,
      startDate: dateToKey(habitStart),
      archived: false,
      pauses: pausesByHabit[def.id] ?? [],
      createdAt: dateToIso(shiftDays(habitStart, -2), timeStr),
      updatedAt: dateToIso(endDate, timeStr),
    }
  })

  const habitsById = new Map(habits.map(habit => [habit.id, habit]))

  const entries: HabitEntry[] = []
  const suggestions: CoachingSuggestion[] = []

  let cursor = new Date(periodStart)
  while (cursor <= endDate) {
    const dateKey = dateToKey(cursor)
    const daysSinceStart = Math.round((cursor.getTime() - periodStart.getTime()) / 86_400_000)
    const phase = daysSinceStart < PHASE_1_START ? 0 : daysSinceStart < PHASE_2_START ? 1 : 2
    const weekday = cursor.getDay() // 0 = Sun … 6 = Sat

    for (const def of HABIT_DEFS) {
      const habitStart = shiftDays(periodStart, def.startOffsetDays)
      if (cursor < habitStart) continue
      if (!def.scheduleWeekdays.includes(weekday)) continue
      // Paused days are not due, so no entry is generated for them (ADR-0010).
      if (isInDemoPause(def.id, dateKey)) continue

      const successRate = def.successRates[phase]
      const roll = rng()

      let status: 'done' | 'missed' | 'skipped'
      if (roll < successRate) {
        status = 'done'
      }
      else if (roll < successRate + (1 - successRate) * SKIP_RATE) {
        status = 'skipped'
      }
      else {
        status = 'missed'
      }

      const entryId = `entry_${def.id}_${dateKey}`
      const [hh, mm] = def.reminderTime.split(':')
      const reminderIso = `${hh}:${mm}:00.000`

      const entry: HabitEntry = {
        id: entryId,
        habitId: def.id,
        date: dateKey,
        status,
        completedAt: status === 'done' ? dateToIso(cursor, reminderIso) : null,
        missReasonCode: null,
        missReasonNote: null,
      }

      if (status === 'missed' && rng() < MISS_REASON_RATE) {
        const reasons = MISS_REASONS[def.id] ?? []
        const [code, note] = (reasons[Math.floor(rng() * reasons.length)] ?? []) as [MissReasonCode, string]
        entry.missReasonCode = code
        entry.missReasonNote = note

        // Coaching comes straight from the real engine so demo data can never
        // drift from what the app actually suggests (issue #38, ADR-0005).
        // Deterministic factories preserve the historical demo IDs/timestamps.
        const habit = habitsById.get(def.id)
        if (habit) {
          suggestions.push(
            ...generateSuggestionsForMissedEntry(entry, habit, {
              idFactory: index => `suggestion_${entryId}_${index + 1}`,
              createdAtFactory: index => dateToIso(cursor, `21:0${index}:00.000`),
            }),
          )
        }
      }

      entries.push(entry)
    }

    cursor = shiftDays(cursor, 1)
  }

  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    habits,
    entries,
    suggestions,
    settings: {
      notificationsEnabled: true,
      dailyReviewTime: '20:00',
      weekStartsOn: 1,
      primaryColor: 'emerald',
      lastExportedAt: null,
      backupNudgeSnoozedUntil: null,
    },
  }
}
