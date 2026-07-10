# 12. Dual Vitest projects for Node and Nuxt runtime tests

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

`vitest.config.ts` ran a single project with `environment: 'node'` and a hand-mapped
`~ → ./app` alias. That gives fast, dependency-light coverage of framework-independent
logic — stores, utilities, schema, persistence — but there is **no DOM and no Nuxt
context**, so components and pages are structurally untestable at the unit level. Anything
that depends on Nuxt auto-imports, Nuxt UI, routing, or the Nuxt-provided Pinia instance
(e.g. `HabitForm`'s weekday validation, or the completion-rate math computed inside
`app/pages/app/insights.vue`) could only be exercised through the Playwright e2e suite,
which is slower and a coarser tool for a single computed value.

We wanted rendered component/page unit tests **without** losing the fast Node path and
**without** moving UI/page logic into extra composables just to make it testable.

## Decision

Split `vitest.config.ts` into two named Vitest projects under one config:

- **`unit`** — `environment: 'node'`, includes `tests/**/*.test.ts` and **excludes**
  `tests/nuxt/**`, keeps the `~ → ./app` alias. This is the existing suite, unchanged in
  behavior and speed.
- **`nuxt`** — built with `defineVitestProject` from `@nuxt/test-utils/config`,
  `environment: 'nuxt'` backed by **happy-dom**, includes only `tests/nuxt/**/*.test.ts`.
  It loads the real `nuxt.config.ts` (and its `@nuxt/ui` / `@pinia/nuxt` modules), so tests
  render through `mountSuspended` and stub auto-imports with `mockNuxtImport`.

`npm test` runs **both** projects, so CI (which calls `npm test`) covers the rendered tests
with no workflow change. `npm run test:unit` and `npm run test:nuxt` select one project for
a faster inner loop.

Development-only dependencies added: `@nuxt/test-utils`, `@vue/test-utils`, `happy-dom`.
`@nuxt/test-utils/module` is deliberately **not** added to `nuxt.config.ts` — its DevTools
integration is optional and unneeded by the Vitest environment or CI.

Two proof tests establish the pattern: `tests/nuxt/habit-form.test.ts` (empty-weekday
submission warns and emits no `submit`) and `tests/nuxt/insights-page.test.ts` (two due
habit-days with one completion render a 50% seven-day rate). Both assert public rendered
behavior — text, mocked toast calls, emitted events — never private `<script setup>`
bindings.

## Consequences

- **Pros:** components and pages are now unit-testable in a realistic Nuxt runtime; the fast
  Node path is preserved for pure logic; CI cannot silently skip rendered tests because
  `npm test` runs both projects.
- **Trade-offs:** Nuxt-runtime tests are slower (they boot a Nuxt app) and share one global
  Nuxt app per file, so each test must reset stores (`$reset()`), restore fake timers, and
  hydrate fixtures before mounting to avoid state leakage. happy-dom has no IndexedDB, so the
  client bootstrap plugin logs a caught Dexie `MissingAPIError` during mount — harmless noise
  that does not touch hydrated stores.
- **Scope:** this is test infrastructure plus two characterization tests; no application
  source, data schema, persistence, or user-facing behavior changed. It preserves
  [ADR-0003](0003-nuxt-4-spa-ssr-disabled.md)'s Nuxt 4 SPA model and
  [ADR-0004](0004-pinia-stores-with-snapshot-persistence.md)'s Pinia conventions, and does
  not replace the Playwright e2e layer.

## References

- `vitest.config.ts` — the two-project configuration.
- `package.json` — `test:unit` / `test:nuxt` scripts and the new dev dependencies.
- `tests/nuxt/habit-form.test.ts`, `tests/nuxt/insights-page.test.ts` — proof tests.
- `docs/TESTING.md` — project boundaries, commands, and isolation rules.
- Supersedes no ADR; complements [ADR-0003](0003-nuxt-4-spa-ssr-disabled.md) and
  [ADR-0004](0004-pinia-stores-with-snapshot-persistence.md).
- Tracking: issue #32.
