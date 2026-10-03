# 25. Factory scheduler: T3 Code scheduled tasks replace claude.ai routines

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

[ADR-0021](0021-factory-manifest-descriptive-source-of-truth.md) made `.factory/factory.yml`
a descriptive manifest of the seven-stage agent factory, with the **claude.ai routine
configuration** as the live source it describes: schedules as cron strings, a per-routine
`enabled` flag, a sandbox `environment`, and a routines API that a future sync script would
write back to.

That premise no longer holds. All seven cloud routines were auto-disabled
(`ended_reason: auto_disabled_repo_access`, last fired ~2026-09-13), so the factory stopped
running. The replacement control plane is **T3 Code scheduled tasks** running on the
maintainer's machine, and the agents reach GitHub through the authenticated `gh` CLI instead
of the cloud-injected `mcp__github__*` tools (#124).

The new runtime differs from the old one in ways the manifest's schema cannot express:

- There is **no cron**. A task's schedule is either `{type: interval, everyMs}` or
  `{type: fixed_time, timeOfDay: "HH:MM", weekdays?}` in machine-local time. A multi-time
  cron such as `0 2,11,21 * * *` is therefore not one task but three.
- Tasks are **project-scoped** T3 app state (the `habit-tracker` project), created and
  changed with T3's `schedule_task` / `list_scheduled_tasks` / `update_scheduled_task` /
  `delete_scheduled_task` / `run_scheduled_task_now` MCP tools — which are reachable only
  from a T3 thread, never from CI.
- There is **no per-task model field** and no per-task tool allowlist: a run inherits the
  provider, model, and tool set of the thread that created the task.
- With `bindToCurrentThread: false` each run starts a fresh top-level thread in a new T3
  worktree branched from `origin/main` — the local equivalent of the cloud's fresh clone.
- Runs happen **only while T3 is running on the host**.

## Decision

Move the factory's declared control plane to T3 Code scheduled tasks and bump the manifest
to `version: 3`. This **amends ADR-0021** — its descriptive-manifest principle and contract
test stand — and supersedes two of its detail decisions.

1. **T3 scheduled tasks are the live source.** The 11 tasks in the `habit-tracker` T3
   project hold the live schedules and enabled state; `.factory/factory.yml` records them.
   The manifest stays **descriptive** (ADR-0021 decision 1): it is the desired state for the
   fields it declares, and applying a change is a human action from a T3 thread, reviewed as
   the `factory.yml` diff.

2. **One task per run time.** `runtime.schedule` (a cron string) is replaced by
   `runtime.runs: ["HH:MM", …]`, machine-local — the host runs UTC, so the times are
   unchanged from the old crons. The seven stages map to **eleven tasks**: triage 22:01,
   planner 23:00, implementer 02:00/11:00/21:00, rebaser 16:15, reviewer 06:00/16:00,
   qa-tester 07:00/17:00, docs-auditor 16:00. The contract test asserts the total, so a
   changed task count must be a visible manifest edit.

3. **Name-match identity, extended to the 1:N mapping.** A task is identified by name,
   `habit-tracker | {stage} HH:MM`, resolved through `list_scheduled_tasks` in the
   `habit-tracker` project. Task IDs stay out of this public tree — the same reasoning as
   ADR-0021 decision 2, which this supersedes in detail (there is no `trigger_id`).

4. **One top-level `scheduler:` block replaces per-stage `environment`.** Where a stage runs
   (kind, project, task-name template, timezone, fresh thread, worktree base, prompt source,
   model inheritance, host-up dependency) is identical for all seven stages, so it is
   recorded once — the same reasoning the manifest already applies to `allowed_tools`. The
   test asserts the block's shape, not its free text.

5. **Prompts are verbatim by construction.** Every task's prompt is the text of its stage's
   `.factory/prompts/{stage}.md`, copied at task creation on 2026-10-03. ADR-0021 decision 3
   recorded `prompts/rebaser.md` as deliberately *stale* live text; #124 re-aligned that
   prompt and the task was created from the file, so the exception is gone and that part of
   decision 3 is superseded. Drift can now only reappear through a task edit that is not
   mirrored back into the file.

6. **`enabled: false` everywhere, descriptively.** All 11 tasks were created disabled; a
   human enables them after a manual `run_scheduled_task_now` smoke test and mirrors that in
   the manifest. `runtime.model` keeps its field and its frontmatter-equality test but is
   redefined as **the per-item agent model pin** (the orchestrator's inherited model is not a
   stage property and is not recorded).

7. **The docs-auditor's daily cadence is deliberate, not drift.** ADR-0021 recorded
   "documented weekly, cron daily" as the last open drift. The daily cadence was carried into
   the T3 task on purpose and no prose claims weekly any more, so the `# DRIFT` annotations
   are removed and the manifest declares **no** drift.

8. **The `<!-- routine:… -->` marker vocabulary is unchanged.** The prefix is a stable
   identifier, not a reference to claude.ai routines; ADR-0023's producer/consumer greps and
   every comment already written depend on it.

## Consequences

- **Pros:** the factory runs again, on a control plane the maintainer owns; a run gets an
  authenticated `gh`, a fresh worktree from `origin/main`, and the host's real browser for
  QA without a network allowlist. `runs` as an HH:MM list is a closer, simpler model of the
  scheduler than cron was, and the contract test keeps every guard it had (ordering,
  one-hour minimum, model pins, markers) on the new representation.
- **Trade-offs:**
  - **Availability is now the host's uptime.** Nothing runs while T3 is down on the machine;
    a missed window is simply skipped, not queued.
  - **Two cloud features are lost with no local equivalent:** `autofix_on_pr_create` (was on
    for the implementer) and routine push notifications.
  - **The orchestrator's model is inherited, not declared.** It depends on the thread that
    created the task, so the manifest cannot record it; only the per-stage agent pins are
    machine-checked.
  - **Sync stays a human action.** T3's task tools are reachable only from a T3 thread, so
    the deferred drift-check script can never be a CI job (ADR-0021 left that open pending
    "GitHub Actions reachability"); it would run from a T3 thread, and the implementer tool
    expansion it needs stays deferred for the same authority reason.
  - **The single-scheduler constraint is unchanged but re-aimed:** the idempotency guards are
    advisory (ADR-0023), so the T3 tasks must not run alongside any second scheduler —
    including re-enabled cloud routines.
- **Neutral:** the stage times, the `order_after` edges, and the accepted 14-hour
  rebaser → reviewer re-review gap carry over 1:1.
- Amends ADR-0021 (which stays **Accepted**) and supersedes its decisions 2 and 3 in detail.
  Related: ADR-0023 (idempotency guards — unchanged, and the reason the marker vocabulary
  stays).

## References

- `.factory/factory.yml` — manifest v3: `scheduler:` block and `runtime.runs`.
- `.factory/README.md` — task identity and the sync convention.
- `.claude/agents/README.md` — task prompts, cadences, and how the tasks are managed.
- `tests/factory-contract.test.ts` — the drift guard on the new representation.
- `docs/FACTORY-GOAL.md` — the dated 2026-10-03 update.
- Issue #123; #124 (agents switched from `mcp__github__*` to the `gh` CLI).
