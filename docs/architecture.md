# Architecture

A client-only Nuxt 4 SPA (`ssr: false`) with all state in the browser. This page shows how the
pieces fit together; the *why* is in [adr/](adr/).

## Layer map

Pages and layouts render reactive Pinia state. Stores are the single source of truth.
Composables wrap cross-cutting concerns (persistence, reminders, auth, demo data). Pure
utilities sit underneath, and Dexie/IndexedDB is the default storage floor — reached through a
`PersistenceAdapter` interface so the backend can be swapped (see [ADR-0009](adr/0009-persistence-adapter-interface.md)).

```mermaid
flowchart TD
  subgraph UI["UI (app/pages, app/layouts, app/components)"]
    pages["pages/app/* — today, review, insights, settings, habits"]
    comps["HabitForm · ReflectionModal · MobileBottomNav"]
  end

  subgraph Stores["Pinia stores (app/stores)"]
    habits["habits"]
    entries["entries"]
    coach["coach"]
    settings["settings"]
  end

  subgraph Composables["Composables (app/composables)"]
    persistence["use-persistence"]
    reminders["use-reminder-engine"]
    auth["use-dummy-auth"]
    demo["use-demo-data"]
  end

  subgraph Utils["Utilities (app/utils)"]
    rules["atomic-rules"]
    date["date"]
    schema["storage-schema (Zod)"]
    adapter["persistence-adapter (interface)"]
    dexie["dexie-persistence-adapter (Dexie)"]
  end

  Storage[("IndexedDB")]

  UI --> Stores
  UI --> Composables
  Stores --> Utils
  Composables --> Stores
  persistence --> schema
  persistence --> adapter
  dexie -. implements .-> adapter
  dexie --> Storage
  coach --> rules
```

## Startup & persistence loop

The client plugin `app/plugins/bootstrap.client.ts` owns the lifecycle: load once, hydrate the
stores, reconcile derived state, then persist changes back on a debounce.

```mermaid
sequenceDiagram
  participant Boot as bootstrap.client.ts
  participant P as usePersistence
  participant A as PersistenceAdapter (Dexie)
  participant DB as IndexedDB
  participant S as Pinia stores

  Boot->>P: load()
  P->>A: migrate legacy localStorage on first run
  P->>A: load()
  A->>DB: read AppData (meta schemaVersion + tables)
  DB-->>A: raw data
  A->>A: validate with Zod + migrate V1→V2 (fallback to empty on failure)
  A-->>P: AppDataV2
  P-->>Boot: AppDataV2
  Boot->>S: hydrate(habits / entries / suggestions / settings)
  Boot->>S: ensureMissedEntries(activeHabits, today)
  Boot->>S: reconcileMissingSuggestions(activeHabits, entries)
  Note over Boot,S: deep watch combined snapshot()
  S-->>Boot: state change
  Boot->>Boot: debounce 800ms (flush on pagehide / visibility hidden)
  Boot->>P: save(snapshot)
  P->>A: save(snapshot)
  A->>DB: write AppDataV2 (schemaVersion: 2)
```

The persisted envelope is **`AppDataV2`** (`{ schemaVersion: 2, habits, entries, suggestions,
settings }`). Each `Habit` carries a `pauses: HabitPause[]` list of inclusive `YYYY-MM-DD`
ranges; days inside a pause are never *due*. Stored V1 payloads and legacy `localStorage`
migrate up via a one-way `migrateToV2` inside `parseAppData`
(see [adr/0010](adr/0010-appdatav2-flexible-schedules-pause-ranges.md) and
[adr/0006](adr/0006-zod-validated-versioned-data-schema.md)).

## Coaching flow

Missing a habit and recording *why* deterministically produces suggestions — no LLM, no
network (see [ADR-0005](adr/0005-deterministic-atomic-habits-coaching-engine.md)).

```mermaid
flowchart LR
  miss["Habit marked 'missed'<br/>(today's queue / ensureMissedEntries)"]
  review["Review page · ReflectionModal"]
  reason["setMissReason(entryId, code, note)"]
  gen["coach.generateForEntry()"]
  rules["atomic-rules:<br/>BUILD_RULES / BREAK_RULES<br/>by habit type + reason"]
  out["CoachingSuggestion[]<br/>(law + direction + action)"]
  show["Surfaced in Review & Insights"]

  miss --> review --> reason --> gen --> rules --> out --> show
```

## Routing

File-based routing under `app/pages/`. Public: `/`, `/login`. Protected (gated by
`app/middleware/auth.global.ts`): `/app`, `/app/habits`, `/app/habits/new`,
`/app/habits/[id]`, `/app/review`, `/app/insights`, `/app/settings`. The middleware also maps
legacy top-level paths (e.g. `/habits` → `/app/habits`) via `app/utils/route-mapping.ts`.

## Related

- Decisions: [adr/](adr/)
- Domain terms: [glossary.md](glossary.md)
- Security model: [../SECURITY.md](../SECURITY.md)
