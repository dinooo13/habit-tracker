# Architecture

A client-only Nuxt 4 SPA (`ssr: false`) with all state in the browser. This page shows how the
pieces fit together; the *why* is in [adr/](adr/).

## Layer map

Pages and layouts render reactive Pinia state. Stores are the single source of truth.
Composables wrap cross-cutting concerns (persistence, reminders, auth, demo data). Pure
utilities sit underneath, and Dexie/IndexedDB is the storage floor.

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
    db["habit-database (Dexie)"]
  end

  Storage[("IndexedDB")]

  UI --> Stores
  UI --> Composables
  Stores --> Utils
  Composables --> Stores
  persistence --> schema --> db --> Storage
  coach --> rules
```

## Startup & persistence loop

The client plugin `app/plugins/bootstrap.client.ts` owns the lifecycle: load once, hydrate the
stores, reconcile derived state, then persist changes back on a debounce.

```mermaid
sequenceDiagram
  participant Boot as bootstrap.client.ts
  participant P as usePersistence
  participant DB as IndexedDB (Dexie)
  participant S as Pinia stores

  Boot->>P: load()
  P->>DB: read AppDataV1 (migrate legacy localStorage on first run)
  DB-->>P: raw data
  P->>P: validate with Zod (fallback to empty on failure)
  P-->>Boot: AppDataV1
  Boot->>S: hydrate(habits / entries / suggestions / settings)
  Boot->>S: ensureMissedEntries(activeHabits, today)
  Boot->>S: reconcileMissingSuggestions(activeHabits, entries)
  Note over Boot,S: deep watch combined snapshot()
  S-->>Boot: state change
  Boot->>Boot: debounce 800ms (flush on pagehide / visibility hidden)
  Boot->>P: save(snapshot)
  P->>DB: write AppDataV1
```

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
