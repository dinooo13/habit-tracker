# 5. Deterministic Atomic Habits coaching engine

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

A core feature is coaching: when a user misses a habit and records *why*, the app should offer
concrete, actionable suggestions grounded in *Atomic Habits*. An LLM could generate these, but
that would require a backend or API key, network access, per-request cost, and would break the
local-first, offline, privacy-preserving model. It would also make output non-reproducible and
hard to test.

## Decision

Implement coaching as a **deterministic rule engine** (`app/utils/atomic-rules.ts`). Two
lookup tables — `BUILD_RULES` and `BREAK_RULES` — map each of the eight miss-reason codes to a
small set of suggestion templates. Each template carries the Atomic law it serves (`obvious`,
`attractive`, `easy`, `satisfying`), a `direction` (`increase` for build habits, `decrease`
for break habits), and a `title` / `action` / `rationale`.

`generateSuggestionsForMissedEntry(entry, habit)` selects the table by habit type, looks up
the reason (defaulting to `other`), and instantiates `CoachingSuggestion` records. The coach
store persists them and can `reconcileMissingSuggestions` for any reflected entry that lacks
them.

## Consequences

- **Pros:** works fully offline with no backend, no API key, and no cost; output is
  deterministic and therefore easy to unit-test (`tests/atomic-rules.test.ts`); content is
  reviewed and on-brand rather than hallucinated; latency is zero.
- **Trade-offs:** suggestions are bounded by the authored templates — less adaptive or
  personalized than a generative model, and expanding coverage means editing the rule tables
  by hand. The mapping is intentionally simple (habit type + reason code), not context-aware
  beyond that.

## References

- `app/utils/atomic-rules.ts` — `BUILD_RULES`, `BREAK_RULES`, `generateSuggestionsForMissedEntry`.
- `app/stores/coach.ts` — generation, reconciliation, storage.
- `app/types/app-data.ts` — `CoachingSuggestion`, `AtomicLaw`, `LawDirection`, `MissReasonCode`.
- `docs/glossary.md` — the laws, directions, and reason codes explained.
