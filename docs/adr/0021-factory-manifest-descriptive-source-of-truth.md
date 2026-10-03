# 21. Factory manifest as the descriptive source of truth for the agent pipeline

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

The seven-stage agent factory (`triage`, `planner`, `implementer`, `rebaser`, `reviewer`,
`qa-tester`, `docs-auditor`) is defined in three places that nothing reconciles:

- `.claude/agents/*.md` — per-item behavior, repo-committed and reviewable.
- `.claude/agents/README.md` — the queues, the label state machine, the marker list, and
  the seven routine prompts, all as prose.
- The claude.ai routine configuration — the real schedules, models, tools, and enabled
  state, reachable through the routines API.

Every source is reachable but nothing compares them, so they drifted silently. As of
2026-08-28 four drifts were verified against live configuration (issue #85 §1): the
documented "rebaser runs before reviewer/qa, same cycle" ordering does not hold (the live
rebaser at 16:15 sits between the afternoon reviewer and qa, so a rebased `needs-review` PR
waits ~14h for the next 06:00 reviewer); the docs-auditor is documented "(e.g. weekly)" but
its cron is daily; the rebaser has no live model pin while its agent frontmatter declares
`model: sonnet`; and one of the seven live routine prompts (the rebaser's) is a stale
revision predating conflict self-resolution. None of these is a mistake anyone made — they
are what happens when three descriptions of one system are never checked against each other.

## Decision

Add `.factory/factory.yml`, a **descriptive** manifest that records the pipeline exactly as
it exists today — one entry per stage with its scope, queue, consumed/produced label
states, human-gate flag, idempotency guard, live `runtime` (schedule/model/enabled), and
`order_after` design-intent edges — plus a static contract test that checks the manifest
against itself and against the repo. No runner, no scheduler, no behavior change.

1. **Descriptive, not authoritative.** The manifest records what is true, including the
   known drifts (the rebaser's empty `model`, the docs-auditor's daily cron, and
   `idempotency.kind: none` where a stage has no guard). The gaps are the point: a machine
   can now diff them. Making the manifest authoritative — a sync script that writes config
   back to the routines API — is deliberately deferred (see Consequences).

2. **Name-match over committed trigger IDs.** The repo is public, so the manifest identifies
   a live routine by its name (`habit-tracker | {stage}`) and resolves the `trigger_id` at
   runtime, keeping account infrastructure IDs out of the public tree at the cost of one
   extra `list` call.

3. **Prompts extracted verbatim.** Each routine prompt moves out of the README prose into
   its own `.factory/prompts/{stage}.md` file holding only the configured text, so drift is
   catchable per-stage by an exact diff. `.factory/prompts/rebaser.md` records the *live*
   (stale) text, because the manifest describes reality; re-aligning the routine to the
   README wording is a deferred runtime-sync operation, not a doc edit.

4. **The contract test is the drift guard.** `tests/factory-contract.test.ts` (Vitest, unit
   project, no network) asserts that agent/prompt paths resolve, every referenced label
   exists in `.github/labels.yml`, each non-empty marker has one producer and a consumer,
   no produced state is orphaned (human-gate states excepted), every stage declares
   `idempotency` explicitly, schedules respect the one-hour minimum, and — crucially — each
   `order_after.realized` flag matches the value computed from the two stages' crons. The
   one knowingly-unrealized edge (reviewer ← rebaser) is declared `realized: false` with a
   note, so the suite is green on the first run while a future cron edit that silently
   changes precedence fails the build.

5. **Correct the docs to match the kept schedule.** The 16:15 rebaser schedule is kept
   deliberately, so the two stale "same cycle" ordering claims in `.claude/agents/README.md`
   and `.claude/agents/rebaser.md`, and the README's parenthetical routine cadences, are
   rewritten to state what actually happens.

## Consequences

- **Pros:** the three descriptions of the pipeline finally agree, and a mechanical check —
  not periodic manual reading — catches divergence. Six of seven live prompts already
  matched the README; the narrow drift is exactly what a per-stage diff is for. Adding a
  stage or editing a cron now has one obvious place to record it and a test that refuses
  silent contradictions.
- **Trade-offs:**
  - The manifest is descriptive, so it can still go stale; unlike today a live diff can
    prove it, but only as often as that diff runs (GitHub Actions reachability to the
    routines API is unverified and deliberately not assumed).
  - One documented ordering intent is knowingly unrealized (`realized: false`). Recording it
    is honest but is a standing invitation to accumulate more such entries; a second one is
    the signal to reschedule rather than annotate again.
  - Prompts moving out of the README cost a reader one extra hop for the exact routine text,
    in exchange for an exact, diffable, per-stage file.
  - Recording live values in a public repo makes routine configuration public; schedules,
    models, and prompts were already effectively public in the README, and name-matching
    keeps the only genuinely new thing (trigger IDs) out of the tree.
- **Deferred (own issues, own failure modes):** the runnable drift-check / write-back sync
  script that would make the manifest authoritative, and the implementer routine's
  routines-API `allowed_tools` expansion that the script alone would need. Giving a
  code-writing agent authority to reconfigure the factory is a real expansion the
  descriptive step avoids taking; `.factory/README.md` records the convention and the bound
  (the script may only `update` the exact declared `runtime:` fields, never `create`).
  Idempotency *implementation* and tightening `kind: none` away belong to #86.
- Supersedes no decision. Related: ADR-0012 (dual Vitest projects — the contract test lives
  in the `unit` project), ADR-0013 (ESLint owns lint/format), and `docs/WORKFLOW.md` (the
  human-readable pipeline description).

## References

- `.factory/factory.yml` — the descriptive manifest.
- `.factory/prompts/*.md` — the seven verbatim routine prompts.
- `.factory/README.md` — the sync convention, identity rule, and deferred prerequisites.
- `tests/factory-contract.test.ts` — the static drift guard.
- `.claude/agents/README.md`, `.claude/agents/rebaser.md` — the corrected ordering claims.
- Issue #85; follow-up #86 (idempotency implementation).

## Addendum (2026-09-05)

The rebaser model drift is closed: every `.claude/agents/{stage}.md` now carries a full
`model:` id in its frontmatter equal to its stage's `runtime.model`, and the contract test
asserts the pair agree. The docs-auditor's daily cron remains the one declared drift.

## Addendum (2026-10-03)

The **live source this ADR describes has moved**: the claude.ai routines were auto-disabled
(`auto_disabled_repo_access`), and the factory now runs as T3 Code scheduled tasks on the
maintainer's machine. See
[ADR-0025](0025-factory-scheduler-t3-scheduled-tasks.md), which **amends** this decision —
its status stays Accepted.

What ADR-0025 supersedes in detail:

- **Decision 2 (name-match over committed trigger IDs)** — the identity rule survives but
  there is no `trigger_id`; a task is name-matched as `habit-tracker | {stage} HH:MM` and
  resolved through T3's `list_scheduled_tasks`, with one task per run time rather than one
  per stage.
- **Decision 3's rebaser exception** — `.factory/prompts/rebaser.md` is no longer deliberately
  stale live text; #124 re-aligned it and the task was created from the file, so every prompt
  file equals its task prompt by construction.

What stands unchanged: the manifest is **descriptive**, not authoritative (decision 1); the
contract test is the drift guard (decision 4), now on `runtime.runs` instead of cron
strings; and the kept 16:15 rebaser schedule with its declared-unrealized ordering edge
(decision 5). The docs-auditor's daily cadence is no longer recorded as drift — ADR-0025
makes it the deliberate choice, so the manifest now declares none. The deferred sync script
is also now definitively **not** a CI job: T3's task tools are reachable only from a T3
thread, which settles the "GitHub Actions reachability" question this ADR left open.
