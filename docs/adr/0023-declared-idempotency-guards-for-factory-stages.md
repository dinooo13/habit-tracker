# 23. Declared, machine-checked idempotency guards for every factory stage

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

ADR-0021 added `.factory/factory.yml` as a descriptive manifest of the seven-stage agent
factory and a contract test that guards it. It deliberately recorded — but did not fix —
`idempotency.kind: none` on the `triage` stage, deferring the tightening to this change
(issue #86, forward-referenced by ADR-0021).

Reading the seven agents, each stage protects against doing the same work twice, but they
do it in three tiers, two do it incompletely, and one does not do it at all:

- `reviewer`, `qa-tester` — a **per-SHA** comment marker (`sha={head}`) plus a label
  self-heal for a run that died between posting the comment and flipping the label.
- `rebaser`, `implementer` — **structural**: a rebased branch is no longer behind
  `origin/main` and leaves the queue; the implementer pushes its branch and opens the
  draft PR before writing the feature, and its dedupe check looks for exactly that PR.
- `planner` — **end-of-run** only: it skips when a plan comment exists and no newer human
  comment changed the requirements.
- `docs-auditor` — check-then-act on an untyped `<!-- routine:docs-audit -->` body marker,
  with **no base SHA**, so a stale audit PR is indistinguishable from a current one.
- `triage` — **none**: `<!-- routine:triage -->` is a comment tag no guard reads, so a
  second run can post a duplicate-notice or missing-information comment on an issue it
  already commented on.

The cost today, under a single nightly scheduler, is small. The cost once a second
execution path shadows or replaces a stage is a double-spawn — two plans on one issue, or
two branches and two PRs. Closing the gaps is a prerequisite for the portable-factory
direction, and the mechanism (which each stage uses, and why) should stop being folklore
that only lives in prose.

## Decision

Make each stage's idempotency mechanism **declared** in `.factory/factory.yml` and
**implemented** in its agent file, following the convention `implementer.md` already sets:
claim with the durable artifact, flip transient state last, and leave the item in its own
queue so a dead run retries for free. **No transient status labels** — they make a claim
exclusive but strand a crashed item outside every queue and depend on a reconciler that
does not exist yet.

1. **A top-level `markers:` registry** in the manifest (`id` / `produced_by` /
   `consumed_by` / `purpose`) records the whole marker graph in one place, including the
   two non-guard markers (`routine:dev-progress`, `routine:rebase`) that no stage skips
   on. This replaces the old vacuous model where a marker's only declared consumer was its
   own producing stage, and makes the issue's "exactly one producer, at least one
   consumer" rule a real check.

2. **A required, non-empty `idempotency.note`** on every stage records the mechanism *and*
   the reasoning, folding the prose that used to live in YAML comments into one
   machine-checked field.

3. **The `kind` enum drops `none`**: `per-sha | fingerprint | structural | end-of-run`.
   The contract test both restricts `kind` to that set and separately asserts no stage
   declares `none`, so the intent survives an enum edit.

4. **`triage` gets typed markers and a fingerprint guard.** Its comment carries a typed
   marker (`<!-- routine:triage kind=duplicate -->` /
   `<!-- routine:triage kind=missing-information -->`); the registered id templates it as
   `<!-- routine:triage kind={kind} -->`. The guard skips the *comment* when a triage
   marker of any kind already exists and no human comment post-dates it (fingerprint =
   newest human comment timestamp vs. the marker comment's timestamp; ambiguous → run, a
   duplicate comment being cheaper than a missed triage), while still reconciling the
   labels the marker implies — so `self-heal` is `true`. Legacy untyped
   `<!-- routine:triage -->` comments match by prefix and keep guarding.

5. **`docs-auditor` gets a base-SHA marker**: `<!-- routine:docs-audit base={base} -->`,
   where `{base}` is `git rev-parse origin/main` after `git fetch origin main`. An open
   audit PR whose base equals current `origin/main` is a skip; a stale one is refreshed in
   place (rebase, re-audit, rewrite the marker); none means a new branch. This makes the
   daily cron a genuine no-op when `main` has not moved, and distinguishes a current audit
   from a stale one. The three downstream files that name the marker (`implementer.md`,
   `rebaser.md`, `reviewer.md`) are updated to the `base=…` form; prefix matching keeps
   their behavior unchanged.

6. **`planner`, `reviewer`, `qa-tester`, `rebaser`, `implementer` change no behavior.**
   Their mechanism and reasoning move from folklore into `idempotency.note`. `planner`'s
   note records the known limit verbatim: its guard is written at end-of-run, so the race
   window equals the run duration — acceptable under a single scheduler, and to be
   revisited before a second *mutating* execution path exists.

7. **The contract test is tightened** (`tests/factory-contract.test.ts`): the manifest is
   schema v2; no stage declares `kind: none`; every stage has a substantive `note`; every
   non-empty stage marker resolves to exactly one registry entry whose `produced_by` is
   that stage; registry ids are unique with one `routine:{name}` family per entry and a
   non-empty `consumed_by` of declared stages; every marker's `routine:{name}` family is
   grounded by grep in its producer and every consumer agent file; and pure
   family/placeholder helper functions carry negative-case proofs that the guards bite.

## Consequences

- **Pros:** every stage's guard is declared and machine-checked; a stage can no longer
  ship with no guard; the marker graph has one readable home with a real producer/consumer
  check; two live gaps close (triage double-comments, stale-vs-current audit PRs) with a
  wide-but-shallow diff — one manifest, one test, five agent files, three docs.
- **Trade-offs:** these guards are **advisory, not exclusive**. They narrow the
  duplicate-work window from an entire run to the gap between reading the queue and writing
  the claim; they do not make concurrent runs impossible. That is the correct trade under
  one scheduler, and it is stated as a known limit rather than left implicit. Triage's
  fingerprint uses the latest human comment observed at run time (no timeline API); where
  the signal is ambiguous it runs rather than skips.
- **Deferred (own issues):** exclusive claiming and transient status labels — until a
  second *mutating* execution path exists (and if shadow mode is non-mutating by
  definition, perhaps never, since cutover is one scheduler replacing another rather than
  two running at once); the stall reconciler, run records, and WIP policy; and triage's
  `blocked → needs-plan` recovery for issues where a human later supplied the missing
  information (it needs these typed markers as a prerequisite but is a behavior change of
  its own).
- Supersedes no decision. Extends ADR-0021 (the descriptive manifest and its contract
  test) rather than reversing it: ADR-0021 stays as written, and this record closes the
  one drift it explicitly deferred.

## References

- `.factory/factory.yml` — the `markers:` registry, the tightened `kind` enum, and the
  per-stage `idempotency.note`.
- `.factory/README.md` — the marker registry and required `note` in the Layout table; the
  descriptive-drift list, now with the `kind: none` drift closed.
- `tests/factory-contract.test.ts` — the tightened contract test.
- `.claude/agents/triage.md` — typed markers + the fingerprint guard.
- `.claude/agents/docs-auditor.md` — the base-SHA marker and skip/refresh/new procedure.
- `.claude/agents/implementer.md`, `.claude/agents/rebaser.md`, `.claude/agents/reviewer.md`
  — downstream docs-audit marker text updated to `base=…`.
- `docs/WORKFLOW.md` §6 — every stage declares an idempotency guard; the guards are
  advisory.
- Issue #86; ADR-0021 (the descriptive manifest this extends).
