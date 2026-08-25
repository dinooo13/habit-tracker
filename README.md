# Atomic Habit Tracker

A local-first habit tracker inspired by James Clear's *Atomic Habits*. Plan habits around
the identity you want to build, run a focused daily queue, reflect on the days you miss, and
get deterministic coaching grounded in the four laws of behavior change — all in the browser,
with no backend and no account required.

> Built with Nuxt 4 + Vue 3 as a client-only PWA. All data stays on your device.

## Features

- **Habit planning** — create *build* or *break* habits with an identity statement, a
  weekday schedule, an optional reminder time, and a start date.
- **Today's queue** — a single focused dashboard of the habits due today with quick
  done / missed / skipped actions and live streak/progress feedback.
- **Missed-habit reflection** — when a habit slips, capture *why* using one of eight reason
  codes (plus a free-text note).
- **Deterministic coaching** — each reflected miss yields concrete suggestions mapped from
  the habit type + reason to the four Atomic Habits laws (obvious, attractive, easy,
  satisfying). No LLM, fully reproducible and offline.
- **Insights & analytics** — streaks, completion rates over 7d / 30d / all-time windows, and
  a distribution of why habits are missed.
- **Backup & restore** — export/import your data as JSON for portability and safekeeping.
- **PWA** — installable, works offline, with best-effort local reminders.
- **Personalization** — five color themes, light/dark/system color mode, and a configurable
  daily-review time and week-start day.
- **Local demo auth** — a one-click demo gate (no real account; see [Security](#security)).

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Nuxt `4.3.1` (Vue `3.5`), `ssr: false` (SPA) |
| Language | TypeScript `5.9` |
| UI | Nuxt UI `4` + Tailwind CSS `4` |
| State | Pinia |
| Persistence | Dexie `4` (IndexedDB) |
| Validation | Zod `4` |
| PWA | `@vite-pwa/nuxt` |
| Dates | `@internationalized/date` + local date-key helpers |
| Testing | Vitest `4` + `fake-indexeddb` |

## Getting started

Prerequisites: **Node 22** and npm.

```bash
npm install
npm run dev
```

Then open the printed local URL. On the login screen you can start fresh or load demo data.

## Scripts

```bash
npm run dev          # Dev server with HMR
npm run build        # Production build
npm run preview      # Serve the production build locally
npm run generate     # Static SPA generation — CI uses this to produce the deployable output
npm run test         # Run the Vitest suite once
npm run test:watch   # Vitest in watch mode
npm run lint         # Lint all code with ESLint (read-only check)
npm run lint:fix     # Apply safe ESLint/Stylistic autofixes
npm run typecheck    # nuxt typecheck (vue-tsc)
```

## Project structure

```
app/
├── pages/                 # File-based routes
│   ├── index.vue          # Landing
│   ├── login.vue          # Demo login
│   └── app/               # Protected app
│       ├── index.vue      # Today's queue
│       ├── review.vue     # Missed-habit reflection
│       ├── insights.vue   # Analytics
│       ├── settings.vue   # Preferences + export/import
│       └── habits/        # List, new, [id] edit
├── layouts/               # default (public) + app (authenticated shell)
├── components/            # HabitForm, ReflectionModal, MobileBottomNav, BrandLogo
├── stores/                # Pinia: habits, entries, coach, settings
├── composables/           # use-app-data-lifecycle, use-habit-actions, use-persistence, use-reminder-engine, use-dummy-auth, use-demo-data, use-backup-nudge, use-pwa-update, use-security-log, use-storage-health, use-clipboard
├── utils/                 # by intent: domain/, persistence/, ui/, auth/, observability/ (ADR-0014)
├── types/                 # app-data (domain model), navigation
├── middleware/            # auth.global (route protection + legacy redirects)
└── plugins/               # bootstrap.client (load → hydrate → reconcile → persist)
```

See [`docs/architecture.md`](docs/architecture.md) for diagrams of the startup, persistence,
and coaching flows.

## Data & persistence

- **Local-first.** All habits, entries, coaching suggestions, and settings persist in
  **IndexedDB** via Dexie, reached through a swappable `PersistenceAdapter` interface
  (`app/utils/persistence/persistence-adapter.ts`, default `app/utils/persistence/dexie-persistence-adapter.ts`).
  There is no server.
- **Versioned envelope.** Data is stored as an `AppDataV2` object (`schemaVersion: 2`) and
  validated with Zod on load (`app/utils/persistence/storage-schema.ts`); older `AppDataV1` payloads migrate
  up via a one-way `migrateToV2`, and corrupt data falls back to an empty state rather than
  crashing.
- **Legacy migration.** A previous `localStorage` payload is migrated into IndexedDB on first
  load, then cleaned up.
- **Single device.** Data does not sync across devices or browsers — use **JSON export/import**
  (Settings page) for backup and transfer.

## Architecture decisions

Significant decisions are recorded as ADRs in [`docs/adr/`](docs/adr/):

1. [Record architecture decisions](docs/adr/0001-record-architecture-decisions.md)
2. [Local-first storage with IndexedDB/Dexie](docs/adr/0002-local-first-storage-with-indexeddb-dexie.md)
3. [Nuxt 4 SPA with SSR disabled](docs/adr/0003-nuxt-4-spa-ssr-disabled.md)
4. [Pinia stores with snapshot persistence](docs/adr/0004-pinia-stores-with-snapshot-persistence.md)
5. [Deterministic Atomic Habits coaching engine](docs/adr/0005-deterministic-atomic-habits-coaching-engine.md)
6. [Zod-validated, versioned data schema](docs/adr/0006-zod-validated-versioned-data-schema.md)
7. [Client-side dummy auth](docs/adr/0007-client-side-dummy-auth.md)
8. [PWA best-effort reminders](docs/adr/0008-pwa-best-effort-reminders.md)
9. [Persistence adapter interface](docs/adr/0009-persistence-adapter-interface.md)
10. [AppDataV2 — flexible schedules & pause ranges](docs/adr/0010-appdatav2-flexible-schedules-pause-ranges.md)
11. [Absolute session timeout for dummy auth](docs/adr/0011-absolute-session-timeout-for-dummy-auth.md)
12. [Dual Vitest projects for Node and Nuxt runtime tests](docs/adr/0012-dual-vitest-projects-for-node-and-nuxt-runtime-tests.md)
13. [Nuxt ESLint flat config](docs/adr/0013-nuxt-eslint-flat-config.md)
14. [Intent-revealing utility taxonomy with explicit imports](docs/adr/0014-intent-revealing-utility-taxonomy.md)
15. [App-data lifecycle composable for snapshot/replace/reconcile](docs/adr/0015-app-data-lifecycle-composable.md)
16. [Habit-action composable owns cross-store entry/suggestion transactions](docs/adr/0016-habit-action-composable-owns-cross-store-transactions.md)

## Contributing & workflow

Requirements live in **GitHub issues**, work happens on short-lived branches, and changes
land via PRs that must pass CI. The label taxonomy, branch/PR conventions, and definition of
done are documented in [`docs/WORKFLOW.md`](docs/WORKFLOW.md). Issue and PR templates live in
[`.github/`](.github/).

## Testing

Tests run on **Vitest** across two projects (ADR-0012) — a fast `node` `unit` project and a
Nuxt-runtime `nuxt` project (happy-dom) for rendered components/pages — with `fake-indexeddb`
for storage. They live in `tests/` (rendered tests under `tests/nuxt/`) and cover the stores,
utilities, schema validation, and Dexie round-trips, with fixtures in `tests/fixtures/`. Run
`npm run test`. See [`docs/TESTING.md`](docs/TESTING.md) for conventions.

## Security

This is a client-only app with a **demo authentication gate** — it is a UX convenience, not a
security boundary, and data is stored unencrypted on the device. Read [`SECURITY.md`](SECURITY.md)
before deploying anything resembling this to production.

## Nuxt UI Documentation Contract

Nuxt UI usage is based on:

- <https://ui.nuxt.com/llms.txt>
- Linked `raw/docs/...` pages from that index for exact props/slots/events

When there is ambiguity, the linked raw component docs are the source of truth.

## Notes & limitations

- Reminders are best-effort browser/PWA notifications without backend push — they only fire
  while the app is open and notification permission is granted.
- Data is single-device and local-first; use JSON export/import for backups.
- The auth gate is a demo, not real access control. See [`SECURITY.md`](SECURITY.md).
