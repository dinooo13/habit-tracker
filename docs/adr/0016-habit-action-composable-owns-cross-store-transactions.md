# 16. Habit-action composable owns cross-store entry/suggestion transactions

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

Entry-status transitions and their coaching side-effects were wired by hand inside pages:
`setHabitStatus()` and `reopenHabit()` in `app/pages/app/index.vue`, `submitReflection()` in
`app/pages/app/review.vue`, and pause edits in `app/pages/app/habits/[id].vue`. The habits
store itself reached across stores: `pruneMissedEntriesInPauses()` imported both the entries
and coach stores, the only place a store depended on another store.

No single place owned the entry↔suggestion invariant. The intended rule is:

> A `CoachingSuggestion` exists **iff** its entry is a *reflected* miss
> (`status === 'missed' && missReasonCode !== null`). `done` / `skipped` / paused /
> unreflected-missed entries own zero suggestions.

It was enforced only partially. `reopenHabit` remembered to call `coachStore.removeForEntry`,
but `setHabitStatus` did not: `entriesStore.setStatus` clears `missReasonCode` when a reflected
miss flips to `done`/`skipped`, yet left the orphaned suggestions behind. Those orphans kept
counting toward `inferredCoachUptake` in `app/pages/app/insights.vue` (its entry lookup filters
on `status`, not on reason). `habitsStore.deleteHabit()` was dead code that, if wired up, would
have stranded entries and suggestions linked to a deleted habit.

## Decision

Introduce a single composable, `app/composables/use-habit-actions.ts` (`useHabitActions()`),
that owns every cross-store entry↔suggestion transaction. It composes the existing single-store
primitives and holds no state of its own; pages call the service and never combine store mutators
themselves. Its public surface is five functions:

- `recordHabitStatus(habitId, date, status)` — write the entry, then remove its suggestions
  unless the result is a reflected miss (the fix for orphaned suggestions).
- `reopenEntry(habitId, date)` — clear the entry and its suggestions; returns the removed entry
  or `null`.
- `recordReflection(entryId, reason, note)` — set the miss reason, then regenerate coaching
  exactly once via `coachStore.generateForEntry` (which dedupes by `entryId`).
- `reconcilePauseCleanup(habitId)` — the relocated `pruneMissedEntriesInPauses` logic; drops
  unreflected auto-misses now inside a pause plus their suggestions (behaviour preserved,
  ADR-0010).
- `deleteHabitCascade(habitId)` — safely hard-delete a habit and all of its entries and
  suggestions. Ships unwired (no delete UI yet).

The **service, not a store, enforces the invariant** — putting it inside `entriesStore.setStatus`
would make the entries store depend on the coach store, the exact cross-store reach-in we are
removing. `pruneMissedEntriesInPauses` moves out of `app/stores/habits.ts`, so no store imports
another store. `habitsStore.deleteHabit` remains as a pure single-store removal primitive, now
*used* by `deleteHabitCascade` rather than dead.

The composable imports its stores explicitly (`~/stores/*`, mirroring `habits.ts`) rather than
relying on Nuxt auto-imports, so its unit tests run in the fast Node Vitest project (ADR-0012)
without booting Nuxt.

Per ADR-0014, this stateful orchestration belongs in `app/composables/`, not in `app/utils/domain/`
(pure helpers only) and not in a new `app/services/` layer (ADR-0014 declines to create one).

## Consequences

- **Pros:** the entry↔suggestion invariant has one enforced owner; the latent orphan-suggestion
  bug (done/skipped after reflection) is fixed and covered by tests; the only store→store import
  is removed; `deleteHabit` is safe to wire to a future delete affordance.
- **Trade-offs:** one more indirection between pages and stores; the invariant rule now lives in
  the composable, so future status/suggestion changes must go through it.
- This ADR records a new cross-cutting pattern (invariant ownership; pages call the service, never
  combine store mutators) and the relocation of pause cleanup. It builds on ADR-0004 (Pinia
  snapshot stores), ADR-0005 (deterministic coaching), and ADR-0014 (orchestration in composables)
  and **supersedes none**. ADR-0010's pause-cleanup behaviour is unchanged; only the reference
  moves from `habitsStore.pruneMissedEntriesInPauses` to `useHabitActions().reconcilePauseCleanup`.

## References

- `app/composables/use-habit-actions.ts` — the service.
- `app/stores/habits.ts` — `pruneMissedEntriesInPauses` removed; `deleteHabit` kept as a primitive.
- `app/pages/app/index.vue`, `app/pages/app/review.vue`, `app/pages/app/habits/[id].vue` — callers.
- `tests/habit-actions.test.ts` — invariant coverage.
- Issue #54.
