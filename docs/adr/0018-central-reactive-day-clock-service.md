# 18. Central reactive day-clock service for midnight rollover

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

`todayDateKey()` (`app/utils/domain/date.ts`) returns the current local `YYYY-MM-DD`
key, but it is a plain function call. Long-lived, day-scoped consumers each sampled it
*once* with no clock-reactive dependency:

- `app/pages/app/index.vue` — `const today = todayDateKey()` drove the header, the "Today"
  label, calendar bounds, and future-guard.
- `app/pages/app/habits/index.vue` — `isCurrentlyPaused()` read a one-shot `today`.
- `app/pages/app/insights.vue` — `const today = computed(() => todayDateKey())` looks
  reactive but has no reactive dependency, so it never recomputed.
- `app/pages/app/review.vue` — the 7-day suggestion cutoff was `addDays(todayDateKey(), -6)`.
- `app/composables/use-backup-nudge.ts` — the nudge decision sampled `todayDateKey()`.
- `app/stores/habits.ts` — a `todayDueHabits` getter called `todayDateKey()` with no
  reactive dependency (and no call sites).

Missed-entry reconciliation (`reconcileDerivedState` → `ensureMissedEntries`, ADR-0015)
ran only at startup, import, and demo load. The reminder engine was the only thing that
detected a rollover, via an inline date-change self-check inside its 30s poll.

The result: an installed PWA left open past local midnight shows stale, previous-day UI
and defers missed-entry/coaching reconciliation until another app event or a reload
(issue #70).

## Decision

Introduce a single **reactive day-clock composable**,
`app/composables/use-clock.ts`, as the one source of the current day:

- A **module-singleton reactive `todayKey`** (`ref`, exposed `readonly`). SSR is disabled
  (ADR-0003), so a module-level ref is the simplest and most testable primitive — no
  hydration concern — mirroring the module state of `use-reminder-engine.ts`.
- **`onRollover(cb)`** — register a callback fired with the new key when the local day
  advances; returns an unregister function.
- **`syncNow()`** — recompute `todayDateKey()`; when it differs, update `todayKey` and
  invoke every rollover callback. A throwing subscriber is isolated so it cannot abort the
  others.
- **Rollover detection** — a `setTimeout` armed to the next local midnight and re-armed on
  every fire (in a `finally`, so a failing subscriber cannot stop the clock), **plus** a
  `visibilitychange`→visible and `focus` re-check that also re-arm the timer. Background
  timers are throttled/suspended, so the visibility/focus re-sync is what actually catches
  a rollover that happened while the tab was hidden, and it opportunistically picks up a
  system-clock or timezone change. Re-arming from the current time absorbs suspended-tab
  drift and multi-day gaps — a single `syncNow` jumps straight to the current key.
- **`start()`** runs `syncNow()` *before* arming its timer, correcting any rollover that
  elapsed while bootstrap awaited `persistence.load()`. **`stop()`** clears the timer,
  removes both listeners, drops all subscriptions, and resets the singleton (test isolation
  under the shared Nuxt runtime, ADR-0012).

**Rollover drives reconciliation at the bootstrap boundary.**
`app/plugins/bootstrap.client.ts` registers `onRollover((key) => reconcileDerivedState(key))`
and then `clock.start()`, **after** the debounced snapshot watch is installed — so a
rollover's entry/suggestion mutations reach the existing 800ms persist. This reuses the
ADR-0015 lifecycle and keeps side effects and `persistence.save()` at the call site, per
that ADR's boundary; the clock never touches stores or IndexedDB itself.

**Consumers migrate onto the reactive key.** All the long-lived consumers above now read
`clock.todayKey`. The dashboard advances `selectedDateKey` to the new day on rollover
**only when the user was already viewing the old today**, preserving an intentional
past-day review. The reminder engine sources its day key from the clock, calls `syncNow()`
before reading it (keeping the 30s minute-poll as a safety net), moves its
`notifiedKeys.clear()` into a single `onRollover` registration made in `start()`, and its
`stop()` now removes that subscription **and** the focus/visibility listeners it previously
leaked. The non-reactive `todayDueHabits` getter is removed (no call sites; a non-reactive
day read conflicts with the central-clock contract).

One-shot, event-time reads are intentionally left alone: `settings.vue` (export filename,
import stamp, AI-prompt date) and `HabitForm.vue`'s start-date default are captured at the
moment of an action, not long-lived day-scoped UI, so they have no rollover staleness.

## Consequences

- **Pros:** one authoritative, reactive current-day value; day-scoped UI and derived state
  roll over automatically at local midnight while the app is open; missed-entry/coaching
  reconciliation no longer waits for startup/import/demo/reload; the reminder engine's
  ad-hoc self-check and its `stop()` listener leak are gone.
- **Trade-offs:** timer-based day detection cannot fire while a tab is fully suspended, so
  the visibility/focus re-check is load-bearing rather than incidental (the trade-off named
  in the issue). This remains best-effort and client-only — background/closed-tab rollover
  would need a service worker / push backend, which contradicts ADR-0002/0003/0008;
  reminders and rollover both stay best-effort.
- **Not a timezone feature.** The clock reads the local `Date`, so a mid-session timezone
  change is picked up opportunistically by the re-sync but is not otherwise modelled.
- Supersedes no decision. Related: ADR-0008 (PWA best-effort reminders), ADR-0015 (app-data
  lifecycle), ADR-0003 (SSR disabled), ADR-0012 (dual Vitest projects).

## References

- `app/composables/use-clock.ts` — the service.
- `app/plugins/bootstrap.client.ts` — rollover → `reconcileDerivedState`, start ordering.
- `app/composables/use-reminder-engine.ts`, `app/composables/use-backup-nudge.ts`,
  `app/pages/app/index.vue`, `app/pages/app/habits/index.vue`, `app/pages/app/insights.vue`,
  `app/pages/app/review.vue`, `app/stores/habits.ts` — migrated consumers.
- `tests/nuxt/clock.test.ts`, `tests/nuxt/clock-rollover-consumers.test.ts` — coverage.
- Issue #70.
