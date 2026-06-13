# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

The Atomic Habit Tracker has grown a number of non-obvious architectural choices — a
local-first persistence layer, a deterministic coaching engine, a demo-only auth gate, a
debounced snapshot persistence loop. Until now the rationale for these choices lived only in
the code and in pull-request descriptions, where it is hard to find and easy to lose. New
contributors (human or AI) repeatedly have to reverse-engineer *why* things are the way they
are.

## Decision

We will keep **Architecture Decision Records** in `docs/adr/`, one Markdown file per decision,
numbered sequentially and written in a lightweight MADR-style format (Status / Context /
Decision / Consequences / References).

The records in this directory were written retroactively to capture decisions already present
in the codebase. From here on, structural changes should be accompanied by a new ADR.

## Consequences

- The reasoning behind significant choices is discoverable and version-controlled.
- There is a small ongoing cost: structural changes should add or supersede an ADR.
- ADRs are immutable once accepted; reversing a decision means adding a new record that marks
  the old one as superseded, preserving the history of how thinking evolved.

## References

- `docs/adr/README.md` — index and format.
- `docs/WORKFLOW.md` — when an ADR is expected.
