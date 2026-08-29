/**
 * URL matchers for in-app routes, tolerant of the production host's trailing
 * slash.
 *
 * `nuxt generate` emits prerendered routes as directories
 * (`app/index.html`, `app/insights/index.html`, …). The production/preview host
 * (Apache/Plesk) serves those directories and 301-redirects the no-slash form
 * `/app` → `/app/`, so after a *server* navigation `page.url()` ends in a
 * trailing slash. The local nitro preview server resolves the same path with no
 * redirect, so it ends without one. A URL assertion that follows a server
 * navigation therefore has to accept both shapes — a plain `/\/app$/` can never
 * match on the live origin (this is the bug behind the #106 production-smoke
 * failure).
 *
 * The returned pattern is intentionally NOT anchored at the start, so it is also
 * base-path tolerant: `appRoutePattern('/app')` matches
 * `https://preview.habits.fmeyer.dev/pr-12/app/` too.
 *
 * This module must stay free of `@playwright/test` imports so it can be
 * unit-tested in Vitest's Node environment (see tests/e2e-url.test.ts).
 */

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g

/** Escape a literal path so it can be embedded in a `RegExp` source. */
function escapeRegExp(literal: string): string {
  return literal.replace(REGEXP_SPECIALS, '\\$&')
}

/**
 * Build a `toHaveURL` matcher for an in-app route that accepts an optional
 * trailing slash and is anchored at the end.
 *
 * @example
 * appRoutePattern('/app')                 // → /\/app\/?$/
 * appRoutePattern('/app/habits/hab_123')  // → /\/app\/habits\/hab_123\/?$/
 */
export function appRoutePattern(path: string): RegExp {
  return new RegExp(`${escapeRegExp(path)}/?$`)
}
