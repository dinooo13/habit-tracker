# 10. AppDataV2 — flexible schedules & pause ranges

- **Status:** Accepted
- **Date:** 2026-06-24

## Context

The schedule model was weekday-only (`Habit.scheduleWeekdays`), and
`ensureMissedEntries` retroactively marks every past *due* day as `missed` on every
boot (`app/stores/entries.ts`). A legitimate break — a week of travel, illness, a
planned rest — therefore floods the reflection queue with guilt entries and depresses
streaks and completion rates. Issue #6 asked for either a *paused* date range or an
"N times per week" schedule type.

We chose **pause ranges** as the smaller, well-scoped first step ("N times per week" is
deferred to a follow-up issue + ADR). Pauses fit the *Atomic Habits* framing cleanly:
a paused day is simply *not scheduled*, so none of the downstream "missed" / streak /
coaching machinery needs to know about pauses — it only needs the single due-date
predicate to return `false`.

Adding a field to the persisted `Habit` shape is a **structural schema change**, which
under ADR-0006 means bumping the versioned envelope and adding a migration.

## Decision

Introduce a per-habit list of inclusive pause ranges and bump the persisted envelope to
**`AppDataV2`**.

- **Data shape.** `HabitPause = { start: string; end: string }` — inclusive local
  `YYYY-MM-DD` date keys with `end >= start`. `Habit` gains `pauses: HabitPause[]`
  (default `[]`). The envelope becomes
  `AppDataV2 = { schemaVersion: 2, habits, entries, suggestions, settings }`; only the
  `Habit` shape changed. `APP_DATA_SCHEMA_VERSION` is `2`.

- **Due-date rule (single chokepoint).** A habit is due on `dateKey` iff
  `!archived` **and** `dateKey >= startDate` **and** `scheduleWeekdays` includes the
  weekday **and** `dateKey` is *not* inside any pause. This lives entirely inside
  `isHabitDueOnDate` (`app/utils/domain/date.ts`), so it propagates automatically to every
  getter, `ensureMissedEntries`, `completionRateForHabit`, the insights page, and the
  reminder engine without any call-site changes.

- **Paused day = not due (no entry).** A paused day generates **no entry** (it is not
  `skipped`). It is therefore excluded from due / missed / streak / completion math, and
  — because no missed entry exists — produces no coaching suggestions
  (`reconcileMissingSuggestions` no-ops), so the deterministic coaching engine
  (ADR-0005) is untouched.

- **Retroactive cleanup.** When a pause is added or extended via the edit form,
  `habitsStore.pruneMissedEntriesInPauses(habitId)` removes only **unreflected**
  auto-misses (`status === 'missed'` && `missReasonCode === null`) that now fall inside a
  pause; `done` / `skipped` / reflected entries are preserved. Removed entries also have
  their coaching suggestions dropped.

- **V1 → V2 migration (one-way).** `parseAppData(payload)` reads `payload.schemaVersion`:
  `2` validates as V2; `1` (or a missing/legacy version) validates as V1 then runs
  `migrateToV2()` (map each habit to `{ ...habit, pauses: [] }`, set `schemaVersion: 2`)
  and re-validates as V2; any other explicit version (e.g. a future/bogus value) is
  rejected so callers fall back to `createEmptyAppData()`. The migration is pure,
  non-destructive, and idempotent. It is **one-way**: there is no V2 → V1 down-path.
  The legacy `localStorage` payload (a V1 envelope) flows through the same path, so it is
  upgraded in place on first run.

- **No Dexie store bump.** `pauses` is a nested array, not an index, so the Dexie
  `version(...).stores()` definition is unchanged (ADR-0002). The app-data schema version
  lives in the `meta` table and migrations run in `parseAppData`.

## Consequences

- **Pros:** legitimate breaks no longer punish the user; the change is contained to one
  predicate plus a field, so the blast radius is tiny despite touching due-date logic
  conceptually "everywhere"; existing V1 data and legacy `localStorage` migrate cleanly and
  corrupt input still degrades to empty state.
- **Trade-offs:** the migration is one-way — a user who downgrades the app loses the
  `pauses` field (acceptable for a local-first, single-version PWA). Pauses have no
  per-pause note and there is no recurring/auto-pause detection (explicitly out of scope).
  "N times per week" scheduling remains unsolved and is deferred to a follow-up.

## References

- `app/types/app-data.ts` — `HabitPause`, `Habit.pauses`, `AppDataV2`, `APP_DATA_SCHEMA_VERSION`.
- `app/utils/persistence/storage-schema.ts` — `HabitPauseSchema`, `AppDataV2Schema`, `migrateToV2`, `parseAppData`, `normalizeHabitPauses`.
- `app/utils/domain/date.ts` — `isDateInHabitPause`, the pause check in `isHabitDueOnDate`.
- `app/stores/habits.ts` — `pruneMissedEntriesInPauses`, pause normalization in create/update.
- `app/components/HabitForm.vue` — the pause editor.
- `tests/pause-mode.test.ts` — migration, due-date, prune, completion-rate, coaching behavior.
- Builds on ADR-0002 (Dexie), ADR-0004 (snapshot persistence), ADR-0005 (coaching), ADR-0006 (versioned schema). Supersedes none.
- The V1→V2 step is now one entry in a version-keyed migration registry behind a discriminated parse result; see ADR-0022.
