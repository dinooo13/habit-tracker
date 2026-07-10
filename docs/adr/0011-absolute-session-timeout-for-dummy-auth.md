# 11. Absolute session timeout for dummy auth

- **Status:** Accepted
- **Date:** 2026-06-24

## Context

The demo auth gate (ADR-0007) is a single boolean flag in `localStorage`
(`habit-tracker:v1:dummy-auth`). Because `localStorage` survives indefinitely, the "logged-in"
state never expires — a device left signed in stays signed in forever. The security review
(issue #1, **SEC-03**) flagged the absence of any session expiration. This is a UX/hygiene gap,
not a true security boundary (the gate is trivially bypassable by design), so the fix should be
proportionate: no idle tracking, no backend, no schema change.

## Decision

Give the dummy-auth session an **absolute expiry**. On login we record an expiry timestamp at
`now + DUMMY_AUTH_TTL_MS` (default **7 days**) in a **separate** `localStorage` key
(`habit-tracker:v1:dummy-auth-expires-at`), alongside the existing flag. Every
`initFromStorage()` / `readDummyAuth()` treats the session as logged-out — and clears both
stale keys — when the expiry has passed or the stamp is missing/unparseable. There is **no
sliding renewal** and **no idle timer**; only the absolute lifetime matters.

We keep the state in `localStorage` (not `sessionStorage`) so an installed-PWA session survives
a tab close within the TTL. The expiry stamp lives in its own key, **outside** the persisted
`AppDataV1` envelope, so the Zod schema and persistence layer are unchanged. Session expiry is
recorded through the SEC-16 security-event log (`session.expired`).

This **builds on** ADR-0007 — it does not reverse it. The gate remains a UX convenience, not a
security boundary.

## Consequences

- **Pros:** stale sessions auto-expire after a bounded lifetime; malformed/legacy state is
  cleaned up defensively; no backend, no dependency, no schema migration.
- **Trade-offs:** expiry is wall-clock absolute, so a user is signed out 7 days after login
  regardless of activity. The check runs only client-side (SSR disabled, ADR-0003) and, like
  the gate itself, is not a security control. Clock changes can shift the effective lifetime.

## References

- `app/utils/auth/dummy-auth.ts` — `DUMMY_AUTH_TTL_MS`, `DUMMY_AUTH_EXPIRY_STORAGE_KEY`,
  `readDummyAuth` / `writeDummyAuth` expiry handling.
- `app/composables/use-dummy-auth.ts` — writes the stamp on login, emits `session.expired`.
- `app/middleware/auth.global.ts` — route guard (unchanged logic).
- ADR-0007 (client-side dummy auth), `SECURITY.md`, issue #1 (SEC-03).
