# `.factory/` — the agent-factory manifest

`factory.yml` is a **descriptive, machine-checked map** of the seven-stage agent pipeline
(`triage → planner → implementer → rebaser → reviewer → qa-tester`, plus the standalone
`docs-auditor`). It records the pipeline as it exists today so the three places that define
it — the per-item agent files, the README architecture, and the live T3 Code
scheduled-task configuration (T3 app state for the `habit-tracker` project) — can be
compared mechanically instead of by eye. See
[ADR-0021](../docs/adr/0021-factory-manifest-descriptive-source-of-truth.md) for the why,
[ADR-0025](../docs/adr/0025-factory-scheduler-t3-scheduled-tasks.md) for the move off
claude.ai routines, and `.claude/agents/README.md` for the architecture and label state
machine.

## Layout

| Path | What it is |
| --- | --- |
| `factory.yml` | A top-level `scheduler:` block (the T3 runtime every stage shares: project, task-name template, timezone, fresh thread + worktree, prompt source, model inheritance), then one entry per stage: scope, queue, consumed/produced label states, human-gate flag, idempotency guard (`kind` / `marker` / `self-heal` / a required machine-checked `note`, ADR-0023), live `runtime` (`runs` as a machine-local HH:MM list — one T3 task each — plus `model` and `enabled`), and `order_after` intent edges. Plus a top-level `allowed_tools` (the orchestrator thread's tool set, identical across all seven stages) and a top-level `markers:` registry — the whole HTML-comment marker graph (`id` / `produced_by` / `consumed_by` / `purpose`), one producer and ≥1 consumers per marker, which every stage `marker` must resolve against. |
| `prompts/{stage}.md` | The exact text set as each task's prompt, one verbatim file per stage (all tasks of one stage share it). The README links here instead of inlining them. |
| `../tests/factory-contract.test.ts` | The static contract test (Vitest, `unit` project, no network) that guards the manifest against itself and the repo. |

## The manifest is descriptive

`factory.yml` records **what is true**. As of #123 there is **no declared drift** — all
three of the original divergences (issue #85 §1) are closed:

- `idempotency.kind: none` where a stage had no per-run guard (triage) — closed by #86 /
  ADR-0023: `none` is gone from the enum, every stage declares a guard `kind` and a `note`,
  and every stage `marker` resolves against the top-level `markers:` registry. The guards
  are advisory, not exclusive.
- the rebaser's empty live `model` versus its frontmatter `model: sonnet` — closed by
  pinning every agent file: each `.claude/agents/{stage}.md` frontmatter carries a full
  `model:` id equal to its stage's `runtime.model`, and the contract test asserts the pair
  agree. A model bump therefore touches the agent file and the manifest in one diff, and the
  manifest edit carries the sync obligation below.
- the docs-auditor's daily-versus-weekly cadence — closed by #123 / ADR-0025: the daily
  cadence was carried into its T3 task deliberately and no prose claims weekly any more, so
  recording it as drift would itself be inaccurate.

As of the 2026-10-03 task creation, every prompt file equals its task prompt by
construction; drift can only reappear through a task edit that is not mirrored here.

The contract test is green because the manifest and the repo genuinely agree — and because
the one knowingly-unrealized ordering edge (reviewer ← rebaser, below) is *declared*, not
hidden.

## Identifying a live task

The seven stages run as **eleven** T3 scheduled tasks — one per `runtime.runs` entry — in
the `habit-tracker` T3 project. The manifest identifies a task by **name**,
`habit-tracker | {stage} HH:MM`, and resolves it at runtime through T3's
`list_scheduled_tasks`. This repo is public, so task IDs are kept out of the tree (they live
in T3's app state) at the cost of one extra lookup.

## The sync convention (obligation, not yet a script)

`factory.yml` is the **desired** state for the fields it declares: each stage's `runs`,
`model`, and `enabled`, and the prompt text in `prompts/{stage}.md`. The live state is read
on demand from T3's `list_scheduled_tasks` — there is no cached "last observed" file.

The sync obligation belongs to whoever changes the manifest. Applying a `runtime:` or prompt
change is a **human action from a T3 thread in the `habit-tracker` project**, because T3's
task tools are reachable only from a thread:

- a changed `runs` entry means `update_scheduled_task` on the matching task — or
  `schedule_task` / `delete_scheduled_task` when an entry is added or removed, since the
  mapping is one task per entry;
- a changed `enabled` flag means `update_scheduled_task` on every task of that stage;
- a changed prompt means pasting `prompts/{stage}.md` verbatim into every task of that
  stage;
- a changed `model` is **not** a task edit at all — it is the per-item agent's frontmatter
  pin, which the contract test already holds equal to `runtime.model`.

The review record for any live change is the `factory.yml` / `prompts/*.md` diff in the PR:
a human approves a readable diff, and exactly that is applied. Two bounds survive from the
old convention:

- **a one-hour minimum between two runs of one stage** — now a *pipeline policy* rather than
  an API rule (the advisory idempotency guards need the window to settle, ADR-0023). It is
  what the contract test still asserts.
- **nothing applies a change automatically.** T3 is not reachable from CI at all, so there is
  no job that could silently reconfigure the factory.

### Cloud-only features with no local equivalent

Two things the claude.ai routines provided are simply **gone**, not replaced:

- `autofix_on_pr_create` (was enabled for the implementer routine); and
- routine run push notifications.

### Deferred prerequisites (not built here — issue #85 Out of scope)

A runnable sync script is still **not** part of this change. Two prerequisites move with it:

- the drift-check / write-back script itself, which would compare `factory.yml` against
  `list_scheduled_tasks` and must run **from a T3 thread** (the MCP tools exist nowhere
  else), never from CI; and
- giving the **implementer** T3 task-management tools — its only consumer. Handing a
  code-writing agent authority to reconfigure the factory is a real authority expansion,
  bounded to running the sync script over a human-reviewed diff — taken only when there is
  something to use it for.

## Accepted trade-off: the 14-hour re-review gap

The rebaser task runs at 16:15 (machine-local), outside the overnight chain. A rebased
`needs-qa` PR is re-tested by the 17:00 qa run the same afternoon, but a rebased
`needs-review` PR waits for the 06:00 reviewer the next morning (~14h). The schedule is kept
deliberately; the `reviewer.order_after` edge for `rebaser` is recorded `realized: false`
with a note, and the contract test asserts that annotation matches the run times.
