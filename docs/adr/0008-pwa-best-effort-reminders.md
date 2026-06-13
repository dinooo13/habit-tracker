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
`registerType: 'autoUpdate'`) and implement reminders entirely client-side as a
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
- Known follow-ups captured in `SECURITY.md`/issue #1: `autoUpdate` applies service-worker
  updates silently (SEC-14), and `notifiedKeys` grows unbounded over long sessions (SEC-17).

## References

- `nuxt.config.ts` — PWA manifest, workbox, `registerType`.
- `app/composables/use-reminder-engine.ts` — tick loop, notification logic, dedup.
- `app/plugins/bootstrap.client.ts` — starts the engine.
