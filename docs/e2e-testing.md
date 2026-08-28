# End-to-end testing (Playwright)

The E2E suite drives a real browser against a **locally built-and-served** copy of the
app, covering the journeys the Vitest unit tests can't: route guards, real IndexedDB
round-trips, the rendered UI (toasts, modals, date navigation), and browser-only surfaces
(PWA shell, theme, file export/import, mobile nav). It **complements** the unit tests — it
does not re-test pure logic Vitest already pins (see [`TESTING.md`](./TESTING.md)).

## Commands

| Command | What it does |
| --- | --- |
| `npm run test:e2e` | Run the Playwright suite headless. |
| `npm run test:e2e:ui` | Open the Playwright UI runner. |
| `npm run test:e2e:headed` | Run headed (visible browser). |

Playwright's `webServer` builds and serves the app automatically
(`npm run build && npm run preview` on port 3000), so you don't need a server running
first. Set `E2E_WEB_SERVER=dev` to use the dev server instead (faster, less faithful), or
`E2E_BASE_URL` to point at an already-running server.

**Remote mode.** Set `E2E_SKIP_WEB_SERVER=1` to start no local server at all, so Playwright
drives whatever `E2E_BASE_URL` points at. This is how the post-deploy `production-smoke` job
runs the `@production` subset against the live origin (ADR-0020):

```
E2E_SKIP_WEB_SERVER=1 E2E_BASE_URL=https://habits.fmeyer.dev \
  npx playwright test --grep @production --retries=2
```

First-time setup installs the browser binaries: `npx playwright install --with-deps chromium`.

## Layout

```
e2e/
  specs/      # the test specs (one file per coverage area)
  support/
    data.ts       # deterministic, today-relative AppData builders
    seed.ts       # IndexedDB seeding + auth helpers + persisted-store readers
    fixtures.ts   # custom test fixtures: authedPage, seed()
    constants.ts  # standalone copies of app constants (decoupled from Nuxt)
    pages/        # lightweight page objects (Dashboard, HabitForm, Settings)
```

## How it works

- **Isolation** — each test gets a fresh browser context (clean IndexedDB + `localStorage`),
  so there's no cross-test leakage.
- **Auth** — the `authedPage` fixture sets the dummy-auth `localStorage` flag
  (`DUMMY_AUTH_STORAGE_KEY`) via an init script before the app boots, so specs start
  authenticated. The login flow itself is tested explicitly in `auth.spec.ts`.
- **Seeding** — `seed(data)` recreates the Dexie/IndexedDB database (`habit-tracker`) to
  match the adapter's schema, *before* the app boots, then the test navigates into the app
  and the bootstrap plugin hydrates the stores from it. Data is built **relative to today**
  (`support/data.ts`) so streak/insights assertions stay deterministic regardless of the
  run date.
- **Persistence** — the bootstrap save is debounced (800ms) and flushed on
  `visibilitychange → hidden`. Persistence specs trigger that flush and poll IndexedDB
  (`readPersistedStore`) so a reload never races the write.
- **Selectors** — prefer `getByRole` / `getByLabel` / `getByText`. Queue and habit cards
  carry a marker class (`.queue-card`, `.habit-card`) because Nuxt UI's `UCard` does not
  forward `data-*` attributes (it does forward `:class`).

## Coverage

| Spec | Area |
| --- | --- |
| `auth.spec.ts` | Auth gate, redirects, legacy paths, logout. |
| `smoke.spec.ts` | App shell + seeded hydration. |
| `dashboard.spec.ts` | Queue done/missed/skipped, reopen, counts, date navigation. |
| `habits.spec.ts` | Habit CRUD (build/break, validation, edit, archive). |
| `pause.spec.ts` | Pause ranges: a paused habit is badged and kept out of the queue; pause editor round-trips a range through create. |
| `reflection.spec.ts` | Miss → reflection → coaching suggestions. |
| `settings.spec.ts` | Export/import (full + habits-only), invalid file, delete, demo data. |
| `insights.spec.ts` | Insights sections; theme/accent color apply + persist. |
| `persistence.spec.ts` | Create/status changes survive reload; auth flag survives. |
| `mobile-pwa.spec.ts` | PWA manifest/service worker; mobile bottom-nav. |

### The `@production` subset

A small subset of the specs above is tagged `@production` (Playwright test tags). Tags are
**additive** — those tests still run in the normal `e2e` job; the tag only lets the
post-deploy `production-smoke` job select them with `--grep @production` and drive them
against the live origin (the fixtures are origin-agnostic, so they run unchanged). The
subset covers: the authed shell renders, seeded data hydrates and survives a hard reload,
mobile navigation renders, PWA manifest/SW assets are served, and a deep-link + hard reload
walk (`smoke.spec.ts`) that asserts no unexpected console errors and no failed same-origin
requests — exercising the `.htaccess` SPA fallback and base path that local E2E otherwise
avoids. Do not add a parallel production-only spec; edit and tag the shared ones (ADR-0020).

## CI

The `e2e` job in `.github/workflows/ci.yml` (Node 22) runs Chromium + one mobile project,
gated on the `changes.outputs.site` filter (skipped for docs-only PRs). It caches the
browser binaries, uses `retries: 1` + `trace: 'on-first-retry'`, and uploads the
`playwright-report` and traces as artifacts.

The `production-smoke` job runs **after** `deploy-production` (push to `main`, same `site`
filter). Every build stamps its commit SHA into `.output/public/version.json` (the
`nitro:init` close hook in `nuxt.config.ts`, `COMMIT_SHA` wired in the `build` job); the
smoke job first polls that endpoint until the deployed SHA is live — FTPS mirroring is not
atomic and the host may cache, so this poll is what stops a stale build passing a false
green — then runs the `@production` subset in remote mode with `--retries=2`. It uploads the
report/traces on failure and, on failure, files exactly one label-less bug issue (no dedup);
`issues: write` is scoped to that job alone. See ADR-0020.
