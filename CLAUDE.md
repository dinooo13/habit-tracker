# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

## Overview

**Atomic Habit Tracker** is a local-first, client-only Progressive Web App for planning
habits, reflecting on missed days, and getting deterministic *Atomic Habits*–style
coaching. It is a **Nuxt 4 + Vue 3 SPA with `ssr: false`** — there is **no backend**.
All data lives in the browser (IndexedDB via Dexie). See `docs/architecture.md` for
diagrams and `docs/adr/` for the recorded design decisions.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (runs `nuxt prepare` via `postinstall`). |
| `npm run dev` | Start the dev server with HMR. |
| `npm run test` | Run the Vitest suite once (`vitest run`). |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run typecheck` | Type-check with `nuxt typecheck` (`vue-tsc`). |
| `npm run build` | Production build. |
| `npm run preview` | Serve the built output locally. |

CI (`.github/workflows/ci.yml`, Node 22) runs **`npm test` + `npm run typecheck`** (test
job) and **`npm run generate`** (build job) on every push to `main` and every PR. Locally,
treat `npm run test`, `npm run typecheck`, and `npm run build` as the definition of done —
run `npm run test` and `npm run typecheck` before considering work complete.

## Architecture map

Application source lives under `app/` (the Nuxt 4 app directory).

| Path | Responsibility |
| --- | --- |
| `app/pages/` | File-based routes: `/`, `/login`, and protected `/app/*` (dashboard, habits, review, insights, settings). |
| `app/layouts/` | `default.vue` (public) and `app.vue` (authenticated shell + nav). |
| `app/components/` | `HabitForm.vue`, `ReflectionModal.vue`, `MobileBottomNav.vue`, `BrandLogo.vue`. |
| `app/stores/` | Pinia stores: `habits.ts`, `entries.ts`, `coach.ts`, `settings.ts`. |
| `app/composables/` | `use-persistence.ts`, `use-reminder-engine.ts`, `use-dummy-auth.ts`, `use-demo-data.ts`, `use-pwa-update.ts` (SW update prompt), `use-security-log.ts` (SEC-16), `use-storage-health.ts` (SEC-18 quota/write warnings). |
| `app/utils/` | Pure helpers: `atomic-rules.ts`, `date.ts`, `id.ts`, `persistence-adapter.ts`, `dexie-persistence-adapter.ts`, `legacy-migration.ts`, `storage-schema.ts`, `safe-json.ts`, `dummy-auth.ts`, `security-log.ts`, `storage-health.ts`, `primary-color.ts`, `route-mapping.ts`, `demo-data-generator.ts`. |
| `app/types/` | `app-data.ts` (domain model + constants), `navigation.ts`. |
| `app/middleware/` | `auth.global.ts` — route protection + legacy URL redirects. |
| `app/plugins/` | `bootstrap.client.ts` — startup: load → hydrate → reconcile → persist. |

Key files to know: `app/types/app-data.ts`, `app/stores/*`, `app/composables/use-persistence.ts`,
`app/plugins/bootstrap.client.ts`, `app/utils/atomic-rules.ts`, `app/utils/persistence-adapter.ts`,
`app/utils/dexie-persistence-adapter.ts`, `app/middleware/auth.global.ts`.

## Data model

Defined in `app/types/app-data.ts`:

- **`Habit`** — `type: 'build' | 'break'`, `identityStatement`, `scheduleWeekdays` (0–6),
  `reminderTime`, `startDate`, `archived`, `pauses` (`HabitPause[]`).
- **`HabitPause`** — an inclusive `{ start, end }` range of `YYYY-MM-DD` keys (`end >= start`)
  during which the habit is paused. Paused days are never *due*, so they generate no entry,
  are excluded from missed/streak/completion math, and produce no coaching (ADR-0010).
- **`HabitEntry`** — one habit on one `date` (`YYYY-MM-DD`) with `status: 'done' | 'missed' | 'skipped'`,
  plus `missReasonCode` / `missReasonNote` for reflection.
- **`CoachingSuggestion`** — derived from a missed entry: `law` (one of the 4 Atomic laws),
  `direction` (`increase` for build / `decrease` for break), `title`, `action`, `rationale`.
- **`AppSettings`** — `notificationsEnabled`, `dailyReviewTime`, `weekStartsOn`, `primaryColor`.
- **`AppDataV2`** — the persisted envelope: `{ schemaVersion: 2, habits, entries, suggestions, settings }`.
  Loaded/imported V1 payloads (and legacy `localStorage`) migrate up via a one-way Zod-validated
  `migrateToV2` in `parseAppData` (ADR-0010).

See `docs/glossary.md` for the domain vocabulary.

## Conventions

- **Vue**: `<script setup>` + Composition API everywhere. Components are auto-imported.
- **Stores**: every store exposes `hydrate(data)` (load persisted state) and `snapshot()`
  (plain, proxy-free copy for persistence). Getters are descriptive (`activeHabits`,
  `dueHabitsForDate`, `todayDueHabits`); query helpers use cached `Map`s where hot.
- **Composables** use the `use*` naming convention.
- **Date keys** are local `YYYY-MM-DD` strings, never `Date` objects, to dodge timezone bugs
  (`app/utils/date.ts`). Times are `HH:MM` strings.
- **IDs** are `prefix_uuid` via `createId(prefix)` in `app/utils/id.ts`.
- **Validation**: anything loaded or imported is parsed through Zod before it reaches a store
  (`app/utils/storage-schema.ts`); invalid data falls back to empty state.

## Persistence flow

`app/plugins/bootstrap.client.ts` on startup:
1. `usePersistence().load()` reads from IndexedDB (Dexie), migrating any legacy
   `localStorage` payload on first run.
2. Hydrates the four stores; applies the primary color.
3. Runs `entriesStore.ensureMissedEntries(...)` and `coachStore.reconcileMissingSuggestions(...)`.
4. Deep-`watch`es a combined snapshot and persists it **debounced at 800ms**, flushing
   immediately on `pagehide` and on `visibilitychange → hidden`.

## Guardrails / gotchas

- **SSR is disabled** (`ssr: false`). Browser-only APIs must be guarded with
  `import.meta.client` (or run inside `*.client.ts` plugins). IndexedDB, `localStorage`,
  `Notification`, and `navigator.storage` are all client-only.
- **Auth is a demo gate, not security.** `app/utils/dummy-auth.ts` + `app/middleware/auth.global.ts`
  is a `localStorage` flag with client-only route guards. Do not treat it as a security
  boundary — see `SECURITY.md` and `docs/adr/0007-client-side-dummy-auth.md`.
- **Notifications are best-effort.** The reminder engine polls every 30s and only fires when
  the app is open and permission is granted (`app/composables/use-reminder-engine.ts`).
- **Service worker prompts on update.** `pwa.registerType` is `'prompt'` (not `autoUpdate`):
  new workers download but activate only when the user confirms the reload banner in
  `app/layouts/app.vue` (`app/composables/use-pwa-update.ts`). See ADR-0008.
- **Dummy-auth sessions expire.** An absolute 7-day expiry stamp lives in its own
  `localStorage` key outside the `AppDataV2` envelope (`app/utils/dummy-auth.ts`); see ADR-0011.
- **Nuxt UI documentation contract.** When using Nuxt UI components, defer to
  <https://ui.nuxt.com/llms.txt> and its linked `raw/docs/...` pages for exact props/slots/events.
  Those raw docs are the source of truth when there is ambiguity.

## Pointers

- Diagrams: `docs/architecture.md`
- Domain terms: `docs/glossary.md`
- Testing guide: `docs/TESTING.md`
- Security posture: `SECURITY.md`
- Architecture decisions: `docs/adr/`
- Development workflow (issues → branches → PRs, labels): `docs/WORKFLOW.md`

## Contributing flow (brief)

Requirements live in **GitHub issues**. Branch off `main` (`claude/<slug>` for agent work),
keep one logical change per branch, and open a PR that links the issue with `Closes #N` and
uses the standard sections (`## Summary`, `## Changes`, `## Test plan`). CI must be green.
Full detail in `docs/WORKFLOW.md`.
