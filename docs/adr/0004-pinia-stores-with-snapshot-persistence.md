# 4. Pinia stores with snapshot persistence

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

The UI needs reactive, queryable domain state (today's due habits, streaks, pending
reflections, completion rates) that must also be durably persisted to IndexedDB. Two forces
are in tension: the store should be the single source of truth and freely reactive, but the
persistence layer (IndexedDB structured clone) cannot accept Vue reactive proxies, and writing
to disk on every keystroke would thrash I/O.

## Decision

Model the domain as four **Pinia** stores — `habits`, `entries`, `coach`, `settings` — each
exposing a uniform contract:

- `hydrate(data)` — load persisted state into the store at startup.
- `snapshot()` — return a plain, proxy-free copy suitable for structured clone.

Persistence is owned by a single client plugin (`app/plugins/bootstrap.client.ts`), not by the
stores themselves. It deep-`watch`es a combined snapshot of all stores and writes it back
**trailing-debounced at 800 ms**, with an immediate flush on `pagehide` and on
`visibilitychange → hidden` so nothing is lost when the tab closes.

Hot lookups are backed by cached `Map` getters (e.g. `entries` keyed by `habitId:date`) so the
Insights view does not perform linear scans inside date×habit loops.

## Consequences

- **Pros:** clear separation — stores stay pure and reactive; one place handles persistence;
  debouncing coalesces bursts of mutations into a single write; `snapshot()` guarantees only
  plain data reaches IndexedDB.
- **Trade-offs:** every store must maintain its `hydrate`/`snapshot` pair, and new persisted
  fields must be threaded through both. A debounced write can be up to 800 ms behind the UI,
  mitigated by the flush-on-hide handlers.

## References

- `app/stores/habits.ts`, `app/stores/entries.ts`, `app/stores/coach.ts`, `app/stores/settings.ts`.
- `app/plugins/bootstrap.client.ts` — hydrate, deep watch, debounce, flush.
- Performance work: PR #9 (debounced persistence, indexed entry lookups).
