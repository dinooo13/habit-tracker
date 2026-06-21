# Testing

## Stack

- **[Vitest](https://vitest.dev/)** — `npm run test` (`vitest run`) for a single pass,
  `npm run test:watch` for watch mode. Config in `vitest.config.ts` (environment `node`, tests
  matched by `tests/**/*.test.ts`, with the `~` → `./app` path alias).
- **[`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB)** — an in-memory IndexedDB
  so the Dexie persistence layer can be tested without a browser.
- **Pinia** — store tests create a fresh instance per test with
  `setActivePinia(createPinia())` in `beforeEach`, so state never leaks between tests.
- **[Playwright](https://playwright.dev/)** — `npm run test:e2e` drives a real browser
  against a locally built-and-served copy of the app, covering route guards, IndexedDB
  round-trips, and the rendered UI. See [`e2e-testing.md`](./e2e-testing.md) for the full
  guide. E2E **complements** the unit tests; it doesn't re-test pure logic.

CI runs `npm test` **and** `npm run typecheck` (test job), `npm run build` (build job), and
the Playwright suite (e2e job) — see `.github/workflows/ci.yml`. They must pass.

## What's covered

Tests live in `tests/`:

- **Stores** — `habits-store.test.ts`, `entries-store.test.ts` (status transitions,
  `ensureMissedEntries`, streaks, completion rates), `coach-store.test.ts`.
- **Utilities** — `date.test.ts`, `atomic-rules.test.ts`, `route-mapping.test.ts`,
  `dummy-auth.test.ts`.
- **Schema & validation** — `storage-schema.test.ts`.
- **Persistence** — `dexie-persistence-adapter.test.ts` (Dexie round-trips via
  `fake-indexeddb`, exercised through the `PersistenceAdapter` interface) and
  `legacy-migration.test.ts` (backend-agnostic legacy-localStorage migration).
- **Fixtures** — `fixture-data.test.ts`, `demo-data-loader.test.ts` validate the sample data.

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
  prefer testing those directly over rendering components. Build fixtures with small helper
  factories (see `buildHabit` / `buildCreateInput` in the store tests).

## Running

```bash
npm run test         # one pass (CI mode)
npm run test:watch   # watch mode while developing
npm run typecheck    # type-level checks (also part of "done")
```
