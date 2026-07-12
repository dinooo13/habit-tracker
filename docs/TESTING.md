# Testing

## Stack

- **[Vitest](https://vitest.dev/)** — `npm run test` (`vitest run`) for a single pass,
  `npm run test:watch` for watch mode. Config in `vitest.config.ts`, which defines **two
  named projects** (see [Two Vitest projects](#two-vitest-projects) below): a fast `unit`
  project (Node) and a `nuxt` project (Nuxt runtime + happy-dom).
- **[`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB)** — an in-memory IndexedDB
  so the Dexie persistence layer can be tested without a browser.
- **[`@nuxt/test-utils`](https://nuxt.com/docs/getting-started/testing)** + **[`@vue/test-utils`](https://test-utils.vuejs.org/)**
  + **[`happy-dom`](https://github.com/capricorn86/happy-dom)** — power the `nuxt` project:
  `mountSuspended` renders SFCs/pages in a real Nuxt runtime (auto-imports, Nuxt UI,
  Nuxt-provided Pinia) and `mockNuxtImport` stubs auto-imported composables.
- **Pinia** — `unit` store tests create a fresh instance per test with
  `setActivePinia(createPinia())` in `beforeEach`, so state never leaks between tests. `nuxt`
  tests use the Nuxt-provided Pinia instance and must `$reset()` the stores in `afterEach`.
- **[Playwright](https://playwright.dev/)** — `npm run test:e2e` drives a real browser
  against a locally built-and-served copy of the app, covering route guards, IndexedDB
  round-trips, and the rendered UI. See [`e2e-testing.md`](./e2e-testing.md) for the full
  guide. E2E **complements** the unit tests; it doesn't re-test pure logic.

CI runs `npm run lint`, `npm test`, **and** `npm run typecheck` (test job — lint first),
`npm run generate` (build job), and the Playwright suite (e2e job) — see
`.github/workflows/ci.yml`. They must pass. Because `npm test` runs both Vitest projects, CI
covers the rendered `nuxt` tests automatically with no workflow change.

## Static quality gate (ESLint)

`npm run lint` runs ESLint across `app/`, `tests/`, `e2e/`, and the root lintable configs.
Linting and formatting are owned by the `@nuxt/eslint` flat config with ESLint Stylistic
enabled (no Prettier); see [`adr/0013`](adr/0013-nuxt-eslint-flat-config.md). It is the
first CI gate and part of the local definition of done. `npm run lint` only checks and fails
on any violation; `npm run lint:fix` mutates files to apply safe autofixes. Generated/vendor
output (`.nuxt/`, `.output/`, `node_modules/`, `playwright-report/`, `test-results/`) is not
linted. Test and e2e files relax `@typescript-eslint/no-explicit-any` and `no-dynamic-delete`
via a narrow override in `eslint.config.mjs` for deliberate mock/fixture constructs.

## Two Vitest projects

`vitest.config.ts` runs two projects under one config (ADR-0012):

| Project | Environment | Collects | For |
| --- | --- | --- | --- |
| `unit` | `node` | `tests/**/*.test.ts` (excludes `tests/nuxt/**`) | Framework-independent logic: stores, utilities, schema, persistence. Fast; keeps the `~` → `./app` alias. |
| `nuxt` | `nuxt` + happy-dom | `tests/nuxt/**/*.test.ts` | Rendered components/pages depending on Nuxt auto-imports, Nuxt UI, routing, or Nuxt-provided Pinia. Slower. |

- `npm run test` / `npm run test:watch` run **both** projects, so CI can never skip the
  rendered tests.
- `npm run test:unit` (`vitest run --project unit`) is the quick inner loop for pure logic.
- `npm run test:nuxt` (`vitest run --project nuxt`) runs only the rendered tests.

**Which project?** Prefer `unit` — the stores and utilities under test are framework-light
and cheap to test directly (see *Keep tests pure* below). Reach for `nuxt` only when the
behavior lives in an SFC or page that relies on auto-imports, Nuxt UI, routing, or the Nuxt
Pinia instance — e.g. `tests/nuxt/habit-form.test.ts` (weekday validation) and
`tests/nuxt/insights-page.test.ts` (the Insights completion computed).

**Isolation rules for `nuxt` tests.** The Nuxt environment initializes one global Nuxt app
shared across the tests in a file, so each test cleans up after itself:

- `$reset()` the Nuxt-provided Pinia stores (`useHabitsStore().$reset()`, …) in `afterEach`.
- Restore fake timers / system time (`vi.useRealTimers()`) when you froze the clock.
- Hydrate deterministic fixtures **before** `mountSuspended`, and freeze the date with a
  midday-UTC timestamp so the derived local date key is stable in any CI timezone.
- Assert public rendered text, mocked toast calls, and emitted events — never private
  `<script setup>` bindings.

happy-dom has no IndexedDB, so the client bootstrap plugin logs a caught Dexie
`MissingAPIError` during mount; it is harmless noise and does not overwrite the fixtures you
hydrated. `@nuxt/test-utils/module` is intentionally **not** added to `nuxt.config.ts` — its
DevTools integration is optional and unneeded for CI or these runtime unit tests. Playwright
remains the real-browser layer for route guards, IndexedDB round-trips, the PWA, and
full end-to-end flows; the `nuxt` project is not a replacement for it.

## What's covered

Tests live in `tests/`:

- **Stores** — `habits-store.test.ts`, `entries-store.test.ts` (status transitions,
  `ensureMissedEntries`, streaks, completion rates), `coach-store.test.ts`,
  `settings-store.test.ts`.
- **Store snapshot contract** — `store-snapshots.test.ts` asserts the ADR-0004
  "plain, proxy-free" guarantee across all four persisted stores: `snapshot()` returns
  a structured-clonable deep clone, roots/records/nested arrays are not Vue proxies, and
  snapshots stay detached from live store state in both mutation directions.
- **Utilities** — `date.test.ts`, `weekdays.test.ts`, `atomic-rules.test.ts`,
  `route-mapping.test.ts`, `dummy-auth.test.ts`, `id.test.ts`, `demo-data-generator.test.ts`,
  `safe-json.test.ts`, `security-log.test.ts`, `storage-health.test.ts`.
- **Schema & validation** — `storage-schema.test.ts`.
- **Persistence** — `dexie-persistence-adapter.test.ts` (Dexie round-trips via
  `fake-indexeddb`, exercised through the `PersistenceAdapter` interface) and
  `legacy-migration.test.ts` (backend-agnostic legacy-localStorage migration).
- **Features** — `pause-mode.test.ts` (pause ranges: due/streak/coaching exclusion) and
  `backup-nudge.test.ts` (`computeBackupNudge` thresholds and snooze).
- **Fixtures** — `fixture-data.test.ts`, `demo-data-loader.test.ts` validate the sample data.

Rendered tests live in `tests/nuxt/` (the `nuxt` project):

- **Components** — `habit-form.test.ts` (empty-weekday submission warns and emits no `submit`).
- **Pages** — `insights-page.test.ts` (two due habit-days with one completion render a 50%
  seven-day completion rate).

Fixtures live in `tests/fixtures/` (e.g. `habit-tracker-6-weeks.json`) and
`public/fixtures/` (the demo payload).

## Conventions

- **Test behavior changes.** Any change to store logic, utilities, schema, or persistence
  should add or update tests in the same PR. The PR template's test checklist references this.
- **Characterization tests.** Some tests deliberately pin *current* behavior — including
  quirks — so that future changes are surfaced as intentional. For example, the entries-store
  tests document that a trailing run of misses does not reset the displayed streak (a known,
  open product question rather than a bug to silently fix). When you change such behavior,
  update the characterization test and call it out in the PR.
- **Keep tests pure.** The stores and utilities under test are framework-light pure functions;
  prefer testing those directly (in the `unit` project) over rendering components. Only render
  in the `nuxt` project when the behavior genuinely lives in the SFC/page. Build fixtures with
  small helper factories (see `buildHabit` / `buildCreateInput` in the store tests).

## Running

```bash
npm run test         # both projects, one pass (CI mode)
npm run test:watch   # both projects, watch mode while developing
npm run test:unit    # fast Node project only (pure logic inner loop)
npm run test:nuxt    # Nuxt runtime project only (rendered components/pages)
npm run lint         # ESLint check (also part of "done")
npm run lint:fix     # apply safe ESLint/Stylistic autofixes
npm run typecheck    # type-level checks (also part of "done")
```
