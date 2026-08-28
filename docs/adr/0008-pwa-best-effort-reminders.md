# 8. PWA best-effort reminders

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

Habit reminders are valuable, and users should be able to install the tracker like a native
app. Reliable, scheduled push notifications normally require a backend (a push service, stored
subscriptions, server-side scheduling). That conflicts with the local-first, no-backend model
(ADR-0002, ADR-0003).

## Decision

Ship a **Progressive Web App** via `@vite-pwa/nuxt` (manifest, icons, offline caching,
`registerType: 'prompt'`) and implement reminders entirely client-side as a
**best-effort polling engine** (`app/composables/use-reminder-engine.ts`). Started from the
bootstrap plugin, it ticks every 30 seconds (and on window focus / tab becoming visible),
and when notifications are enabled and permission is granted it fires a browser `Notification`
for any due habit whose `reminderTime` matches the current minute, plus a daily-review nudge at
the configured time. A `notifiedKeys` set deduplicates within a tick window.

## Consequences

- **Pros:** installable, offline-capable app with reminders and no backend, no push
  infrastructure, and no per-user server state.
- **Trade-offs:** reminders are **best-effort only** — they require the app to be open and
  notification permission granted, and will not fire reliably in the background or when the tab
  is closed. Reminder timing is minute-granular and tied to the 30s tick.
- Known follow-up captured in `SECURITY.md`/issue #1: `notifiedKeys` grows unbounded over long
  sessions (SEC-17).

## Update: prompt before applying service-worker updates (SEC-14, #18)

The original `registerType: 'autoUpdate'` activated a newly downloaded service worker silently,
swapping the running app version with no user consent (SEC-14). Resolved in #18 by switching to
**`registerType: 'prompt'`**: the new worker is fetched but held in the `waiting` state, and
`@vite-pwa/nuxt`'s reactive `$pwa.needRefresh` drives a non-blocking **reload banner** in
`app/layouts/app.vue`. The waiting worker is activated (and the page reloaded) only when the
user clicks **Reload**; the banner is dismissible. A thin `usePwaUpdate()` composable wraps
`$pwa` and degrades to a no-op when the injection is unavailable (SSR/tests). The update
lifecycle is logged via the SEC-16 security log (`pwa.update.available` / `pwa.update.applied`).

## Update: injectable dependencies + instance-owned state (#71)

The reminder engine was refactored from module-global mutable state behind an
instance-looking composable into a `createReminderEngine(deps)` factory (all state —
the interval handle, the `notifiedKeys` dedupe set, the rollover/listener unregister
handles — is closure-local) plus an explicit module-singleton `useReminderEngine()`
accessor that wires the real dependencies. The clock (a minimal `ReminderClock` subset
of ADR-0018's `useClock()`), the notification I/O (a `Notifier` interface with a default
`createBrowserNotifier()` wrapping the `Notification` guards), and the wall-clock minute
source (`now: () => Date`) are all injectable, so ticks are unit-testable without real
timers or the global `Notification`. `stop()` removes the focus/visibility listeners and
unregisters the rollover subscription (the leak in the original `stop()` was fixed in
#70 and is now locked by regression tests). Behaviour, timing, and the public API
(`{ start, stop, tick, requestPermission, currentPermission }`) are unchanged — this is a
pure refactor. The DI-for-testability shape mirrors `createPersistenceSaver` (ADR-0017).

## References

- `nuxt.config.ts` — PWA manifest, workbox, `registerType: 'prompt'`.
- `app/composables/use-pwa-update.ts` — `needRefresh` / `reload()` wrapper over `$pwa`.
- `app/layouts/app.vue` — reload banner.
- `app/composables/use-reminder-engine.ts` — `createReminderEngine(deps)` factory (tick
  loop, notification logic, dedup) + module-singleton `useReminderEngine()` accessor (#71).
- `app/plugins/bootstrap.client.ts` — starts the engine.
