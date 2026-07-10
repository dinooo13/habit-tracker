# Security

This document describes the security model of the Atomic Habit Tracker, its known limitations,
and what would be required before any production deployment. It summarizes the full review in
[issue #1](https://github.com/dinooo13/habit-tracker/issues/1) (OWASP Top 10, 2021).

## Security model

The app is a **client-only Nuxt SPA** (`ssr: false`) with **no backend**:

- All data — habits, entries, coaching suggestions, settings — lives in the **browser's
  IndexedDB**, stored **unencrypted**, on a **single device**.
- There is no server, no API, and no network transmission of user data.
- This eliminates entire classes of server-side vulnerability, but shifts the risk to the
  client and to whoever can access the browser/device.

## Known limitations & non-goals

These are deliberate trade-offs for a local-first demo app, **not** bugs to be surprised by:

- **The auth gate is not a security boundary.** Authentication is a single `localStorage` flag
  (`app/utils/auth/dummy-auth.ts`) checked by client-side route middleware
  (`app/middleware/auth.global.ts`). Anyone with the browser, devtools, or any script on the
  same origin can bypass it. It exists for UX, not protection. See
  [ADR-0007](docs/adr/0007-client-side-dummy-auth.md).
- **Data is unencrypted at rest** and readable by any code on the same origin or anyone with
  device access.
- **No multi-user isolation.** All data shares one namespace; logout does not clear data, so a
  shared device exposes the previous user's data.
- **Reminders/notifications are best-effort** and depend on granted permission and the app
  being open. See [ADR-0008](docs/adr/0008-pwa-best-effort-reminders.md).

## Before production

If this app (or a fork) is ever deployed for real users, the review flagged these as the
priority hardening items — tracked in [issue #1](https://github.com/dinooo13/habit-tracker/issues/1):

- **Real authentication** (an identity provider with server-side session validation) — or
  remove the auth gate entirely rather than imply protection (SEC-01, SEC-02).
- **Disable devtools and PWA `devOptions` in production builds** (SEC-10).
- **Add security headers** (CSP, `X-Frame-Options`, `X-Content-Type-Options`, etc.) via the
  hosting platform or Nitro middleware (SEC-11).
- Consider encrypting data at rest and clearing data on logout for shared devices (SEC-05,
  SEC-13).

## Addressed hardening

Findings from the review that have since been mitigated within the local-first model:

- **Bounded import size and collection counts (SEC-06, SEC-09).** Imported JSON is now
  bounded before it can freeze the tab or exhaust storage: a 64 MiB pre-read `File.size`
  check rejects an over-large file before it is read, and Zod `.max()` constraints plus a
  cheap raw-count preflight cap the habit/entry/suggestion collections and each habit's
  `scheduleWeekdays`/`pauses` arrays. String-field max-lengths (`FIELD_LIMITS`) and calendar
  date bounds already shipped; together these keep a crafted or accidental payload from
  driving unbounded work or storage. An over-limit import is rejected as a whole — never
  partially merged or truncated — and current data is left unchanged. See
  `app/types/app-data.ts`, `app/utils/storage-schema.ts`, and `app/pages/app/settings.vue`.
- **Session timeout (SEC-03).** The dummy-auth session now has an absolute 7-day expiry stamp;
  expired/malformed sessions read as logged-out and clear their stale keys. See
  [ADR-0011](docs/adr/0011-absolute-session-timeout-for-dummy-auth.md). *(This is hygiene, not
  access control — the gate is still bypassable by design.)*
- **Service-worker update consent (SEC-14).** `registerType` is now `'prompt'`: new workers
  download but only activate after the user confirms via a reload banner. See
  [ADR-0008](docs/adr/0008-pwa-best-effort-reminders.md).
- **Security event logging (SEC-16).** A lightweight, in-memory client-side event log
  (`app/utils/observability/security-log.ts`) records auth, import/export, deletion, validation-failure, and
  storage events to a bounded ring buffer + console. No network, no persistence.
- **Storage-quota / write-failure notice (SEC-18).** Persistence write failures (especially
  `QuotaExceededError`) and a best-effort `navigator.storage.estimate()` pre-check now surface
  a user-facing warning toast instead of only `console.error`
  (`app/composables/use-storage-health.ts`).

## Reporting a vulnerability

This is a personal/educational project. To report a security concern, open a GitHub issue
labelled `type: security` (or contact the maintainer directly for anything sensitive). Please
describe the issue, affected files, and reproduction steps.
