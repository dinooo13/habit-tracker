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
  (`app/utils/dummy-auth.ts`) checked by client-side route middleware
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
- **Cap unbounded date-range generation** so a crafted import can't freeze the tab via a
  far-past `startDate` (SEC-09).
- **Disable devtools and PWA `devOptions` in production builds** (SEC-10).
- **Add security headers** (CSP, `X-Frame-Options`, `X-Content-Type-Options`, etc.) via the
  hosting platform or Nitro middleware (SEC-11).
- **Add max-length constraints** to all Zod string fields to bound import size (SEC-06).
- Consider encrypting data at rest, prompting for service-worker updates instead of silent
  `autoUpdate`, and clearing data on logout for shared devices (SEC-05, SEC-13, SEC-14).

## Reporting a vulnerability

This is a personal/educational project. To report a security concern, open a GitHub issue
labelled `type: security` (or contact the maintainer directly for anything sensitive). Please
describe the issue, affected files, and reproduction steps.
