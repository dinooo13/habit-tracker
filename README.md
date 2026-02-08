# Atomic Habit Tracker

Nuxt 4 + Vite habit tracker inspired by Atomic Habits. It is local-first (browser storage), includes habit planning, missed-habit reflection, deterministic coaching recommendations, analytics, JSON backup/restore, and best-effort PWA reminders.

## Stack

- Nuxt `4.3.1`
- Vue 3
- Tailwind CSS 4
- Nuxt UI 4
- Pinia
- `@vite-pwa/nuxt`
- Zod

## Nuxt UI Documentation Contract

Nuxt UI usage is based on:

- https://ui.nuxt.com/llms.txt
- Linked `raw/docs/...` pages from that index for exact props/slots/events

When there is ambiguity, the linked raw component docs are the source of truth.

## Scripts

```bash
npm install
npm run dev
npm run test
npm run build
npm run generate
```

## Architecture

- App source lives under `/app` (Nuxt 4 app directory)
- Typed data model: `/app/types/app-data.ts`
- Stores: `/app/stores/*`
- Persistence: `/app/composables/use-persistence.ts`
- Reminder engine: `/app/composables/use-reminder-engine.ts`
- Atomic coaching rules: `/app/utils/atomic-rules.ts`
- Pages: dashboard, habits, review, insights, settings

## Notes

- Reminders are best-effort browser/PWA notifications without backend push.
- Data is single-device local-first; use JSON export/import for backups.
