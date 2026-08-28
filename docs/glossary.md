# Glossary

The domain vocabulary used throughout the code, mostly borrowed from James Clear's
*Atomic Habits*. Types live in `app/types/app-data.ts`; the coaching rules in
`app/utils/domain/atomic-rules.ts`.

## Habits

- **Habit type** — every habit is either:
  - **build** — a behavior you want to do more (e.g. "Morning run"). Coaching pushes its laws
    in the `increase` direction.
  - **break** — a behavior you want to do less. Coaching pushes its laws in the `decrease`
    direction.
- **Identity statement** — the self-concept the habit reinforces (e.g. "I am a runner").
  Atomic Habits frames lasting change as identity-based; the statement is shown as a cue and in
  reminders.
- **Schedule (`scheduleWeekdays`)** — the days a habit is due, as weekday numbers `0`–`6`
  (Sunday = 0). A habit is *due* on a date if it is active, on/after its `startDate`, the
  weekday is in the schedule, **and** the date is not inside a pause (`isHabitDueOnDate`).
- **Pause (`HabitPause`)** — an inclusive `{ start, end }` range of `YYYY-MM-DD` keys
  (`end >= start`) during which a habit is paused. Paused days are *never due*, so they
  generate no entry and are excluded from missed / streak / completion math and coaching
  (`isDateInHabitPause`; see [adr/0010](adr/0010-appdatav2-flexible-schedules-pause-ranges.md)).
- **Start date** — the first date (`YYYY-MM-DD`) the habit counts from.
- **Reminder time** — optional `HH:MM` at which the reminder engine may notify.

## Entries

- **Entry (`HabitEntry`)** — the record of one habit on one date.
- **Status** — `done`, `missed`, or `skipped`. On startup, `ensureMissedEntries` fills in
  `missed` entries for past due days that have no entry yet. Paused days are not due, so no
  entry is generated for them.
- **Date key** — dates are stored as local `YYYY-MM-DD` strings (not `Date` objects) to avoid
  timezone drift (`app/utils/domain/date.ts`).
- **Day clock** — the central reactive current-day service, `useClock()`
  (`app/composables/use-clock.ts`). It exposes a singleton reactive `todayKey` and an
  `onRollover` hook so every long-lived, day-scoped view stays fresh without each one sampling
  the date itself (ADR-0018).
- **Day rollover** — the moment the local date advances (local midnight). The day clock detects
  it with a midnight timer plus a `visibilitychange`/`focus` re-check and, via bootstrap,
  backfills the previous day's missed entries + coaching so an always-open PWA rolls over
  automatically.
- **Streak** — consecutive completed due-days for a habit (`streakForHabit` in `app/utils/domain/stats.ts`).
- **Completion rate** — share of due days completed within a window (7d / 30d / all-time).

## Reflection & coaching

- **Miss-reason code** — when a habit is missed, the user records why. The eight codes:
  `forgot`, `no_time`, `low_motivation`, `too_hard`, `bad_environment`, `no_immediate_reward`,
  `social_pressure`, `other`. Human labels are in `MISS_REASON_LABELS`.
- **The four laws** — the Atomic Habits laws of behavior change, each a `law` on a suggestion:
  - **obvious** — make the cue visible (or, for break habits, invisible).
  - **attractive** — make it appealing (or unappealing).
  - **easy** — reduce friction (or add friction).
  - **satisfying** — make it immediately rewarding (or add an immediate cost).
- **Direction** — `increase` for build habits, `decrease` for break habits. Determines which
  rule table (`BUILD_RULES` vs `BREAK_RULES`) is used.
- **Coaching suggestion** — a concrete recommendation generated deterministically from
  *(habit type + miss-reason code)*. Carries a `law`, `direction`, `title`, `action`, and
  `rationale`. See [adr/0005](adr/0005-deterministic-atomic-habits-coaching-engine.md).

## Data & settings

- **`AppDataV2`** — the versioned envelope persisted to IndexedDB:
  `{ schemaVersion: 2, habits, entries, suggestions, settings }`. V1 payloads (and legacy
  `localStorage`) migrate up to V2 via a one-way `migrateToV2` in `parseAppData`, which
  defaults `pauses: []` on every habit
  (see [adr/0010](adr/0010-appdatav2-flexible-schedules-pause-ranges.md)).
- **Settings** — `notificationsEnabled`, `dailyReviewTime` (`HH:MM`), `weekStartsOn`
  (`0` Sunday / `1` Monday), and `primaryColor` (one of `sky`, `emerald`, `violet`, `rose`,
  `amber`). `weekStartsOn` is a **display-order preference only**: it sets the first
  weekday shown across the dashboard calendar, the habit form's weekday selector, and the
  habit-list schedule summary. It never changes weekday *storage* — `Habit.scheduleWeekdays`
  stays as canonical JS weekday numbers (`0=Sun … 6=Sat`), and due-date, reminder, streak,
  and coaching logic keep using those absolute numbers regardless of the setting. The shared
  ordering rule lives in `app/utils/domain/weekdays.ts`. Two optional, nullable fields back
  the **Backup nudge**: `lastExportedAt` (ISO
  timestamp of the last successful export) and `backupNudgeSnoozedUntil` (date key the nudge
  is snoozed to after a dismissal).
- **Backup nudge** — a dismissible Today-dashboard banner that warns when local data has gone
  unexported for too long (`≥ 2` weeks). It tracks export recency via `lastExportedAt`, links
  to the existing export flow, and snoozes for 7 days on dismissal. Logic lives in
  `app/composables/use-backup-nudge.ts`.
- **Persistence status** — the runtime lifecycle of the local save path (issue #65, ADR-0017),
  one of `ok | saving | failed | unavailable`, tracked (with a last-successful-save time) by
  `useStorageHealth()`. A failed write retries with exponential backoff; a quota error or
  exhausted retries enter the terminal **degraded (unavailable) mode**. It is runtime-only — never
  persisted, so it resets on reload.
- **Degraded (unavailable) mode** — the terminal persistence state where writes are failing and
  cannot be recovered automatically. The app shell shows a standing recovery banner offering an
  **Export backup** and a **Retry now**, so the user can get their data out before it is lost.
- **Quarantine** — when stored data fails Zod validation on load, the raw (un-parseable) payload is
  preserved in a dedicated Dexie `quarantine` table (newest-only, never cleared by normal saves)
  instead of being discarded (issue #66, ADR-0019). A load-time recovery banner — **Export preserved
  data** / **Dismiss** — lets the user export the raw JSON or clear it. Tracked by `useDataRecovery()`,
  distinct from the save-time persistence status above.
