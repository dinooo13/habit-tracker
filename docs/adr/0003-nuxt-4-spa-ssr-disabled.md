# 3. Nuxt 4 SPA with SSR disabled

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

The app is local-first: all data lives in the browser (IndexedDB) and there is no backend to
render against. Server-side rendering would have nothing meaningful to render for a logged-in
user, and a Node server would add hosting cost and complexity for zero benefit. At the same
time we want a real framework's routing, conventions, module ecosystem, and first-class PWA
support.

## Decision

Use **Nuxt 4** configured as a pure client-side SPA with **`ssr: false`** (`nuxt.config.ts`).
We rely on Nuxt's file-based routing (`app/pages/`), auto-imports, layouts, middleware, and
plugins, plus the `@nuxt/ui`, `@pinia/nuxt`, and `@vite-pwa/nuxt` modules. The result is a
fully static, CDN-deployable bundle.

## Consequences

- **Pros:** no server to run or pay for; deploy as static assets; Nuxt conventions and module
  ecosystem; clean PWA story (offline-capable).
- **Trade-offs:**
  - All browser-only APIs (IndexedDB, `localStorage`, `Notification`, `navigator.storage`)
    must be guarded with `import.meta.client` or run inside `*.client.ts` plugins.
  - Route protection runs only in the browser, so it is cosmetic, not enforced — see
    ADR-0007 and `SECURITY.md`.
  - No SSR/SSG SEO benefit (acceptable for an authenticated personal app).
- The `generate` script is kept for parity but is not part of the deployment path.

## References

- `nuxt.config.ts` — `ssr: false`, modules, PWA config.
- `app/plugins/bootstrap.client.ts` — client-only startup.
- `app/middleware/auth.global.ts` — client-side route guards.
