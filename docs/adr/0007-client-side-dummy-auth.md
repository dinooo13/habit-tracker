# 7. Client-side dummy auth

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

The app has a "logged-in" experience (the `/app/*` routes) distinct from the public landing
and login pages, and we want that separation in the UX — a login screen, protected routes, a
logout button. But there is **no backend**, no user accounts, and no data to protect on a
server. A full authentication system would be wholly disproportionate to a single-device,
local-first app.

## Decision

Implement a **demo auth gate**: a single boolean flag in `localStorage`
(`habit-tracker:v1:dummy-auth`, in `app/utils/auth/dummy-auth.ts`) read by a global route
middleware (`app/middleware/auth.global.ts`) that redirects unauthenticated visitors away from
`/app/*` to `/login`, and handles legacy URL redirects. Post-login redirects are validated as
safe internal paths (`isSafeInternalRedirect`) to avoid open-redirect issues.

This is explicitly a **UX convenience, not a security boundary**, and it is documented as such.

## Consequences

- **Pros:** gives the intended login/logout/protected-route UX with near-zero complexity and
  no backend; the redirect-target validation is solid.
- **Trade-offs / risks (documented, not mitigated here):**
  - Anyone can "authenticate" by setting a flag; route guards run only client-side and are
    trivially bypassable (SSR is disabled — ADR-0003).
  - There is no per-user data isolation and logout does not clear data, so shared devices
    expose previous data.
  - This is **not** suitable as-is for any deployment that needs real access control; that
    would require a real identity provider and server-side session validation.

See `SECURITY.md` and issue #1 (SEC-01, SEC-02, SEC-08, SEC-13) for the full analysis and the
hardening required before production.

## References

- `app/utils/auth/dummy-auth.ts` — flag storage + `isSafeInternalRedirect` / `resolveRedirectTarget`.
- `app/composables/use-dummy-auth.ts` — session state.
- `app/middleware/auth.global.ts` — route protection + legacy redirects.
