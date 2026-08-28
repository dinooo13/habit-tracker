# `.factory/` — the agent-factory manifest

`factory.yml` is a **descriptive, machine-checked map** of the seven-stage agent pipeline
(`triage → planner → implementer → rebaser → reviewer → qa-tester`, plus the standalone
`docs-auditor`). It records the pipeline as it exists today so the three places that define
it — the per-item agent files, the README architecture, and the live claude.ai routine
configuration — can be compared mechanically instead of by eye. See
[ADR-0021](../docs/adr/0021-factory-manifest-descriptive-source-of-truth.md) for the why and
`.claude/agents/README.md` for the architecture and label state machine.

## Layout

| Path | What it is |
| --- | --- |
| `factory.yml` | One entry per stage: scope, queue, consumed/produced label states, human-gate flag, idempotency guard, live `runtime` (schedule/model/enabled), and `order_after` intent edges. Plus a top-level `allowed_tools` (the orchestrator's list, identical across all seven routines). |
| `prompts/{stage}.md` | The exact text configured as each routine's orchestrator prompt, one verbatim file per stage. The README links here instead of inlining them. |
| `../tests/factory-contract.test.ts` | The static contract test (Vitest, `unit` project, no network) that guards the manifest against itself and the repo. |

## The manifest is descriptive

`factory.yml` records **what is true**, including known divergences (issue #85 §1):

- the rebaser's live `model` is empty (env default) while its agent frontmatter says
  `model: sonnet`;
- the docs-auditor's cron is daily, though older prose called it weekly; and
- `idempotency.kind: none` where a stage has no per-run guard (triage) — tightened away by
  the follow-up #86.

`prompts/rebaser.md` likewise records the **live (stale)** routine text: it predates conflict
self-resolution, so its summary vocabulary has no `self-resolved` bucket and it says "Never
resolve conflicts, review, merge, or push to main yourself" where the README says "Never
resolve conflicts *you are not confident about*". The agent file `.claude/agents/rebaser.md`
carries the current self-resolution protocol, so behavior is governed correctly; only the
orchestrator framing is stale. Re-aligning the routine to the README wording is a
`runtime`-field sync operation (below), not a doc edit — recorded here so the divergence is
not lost.

The gaps are the point. The contract test is green on the first run because the divergence is
*declared*, not hidden.

## Identifying a live routine

The manifest identifies a routine by **name** (`habit-tracker | {stage}`) and resolves its
`trigger_id` at runtime from the routines `list` API. This repo is public, so trigger IDs are
kept out of the tree at the cost of one extra API call.

## The sync convention (obligation, not yet a script)

`factory.yml` is the **desired** state for the fields it declares. Live routine configuration
is fetched on demand from the routines API — there is no cached "last observed" file, because
the API is reachable from routine runs.

The sync obligation belongs to whoever changes the manifest: when a change edits a `runtime:`
field, the same run applies it **through the sync script, never through hand-composed API
calls**. The review record for any live change is the `factory.yml` diff in the PR — that is
why the script may apply only the exact declared fields: a human approves a readable diff, and
the script applies precisely that. The script:

- reads `factory.yml` and applies `update` for exactly the declared `runtime:` fields, nothing
  else;
- must never call `create`, and the API cannot delete a routine (web UI only); and
- respects the one-hour minimum cron interval.

If GitHub Actions reachability to the routines API is later confirmed, the same script becomes
a CI job with no redesign.

### Deferred prerequisites (not built here — issue #85 Out of scope)

The runnable script above is **not** part of this change. Two prerequisites move with it:

- the runnable drift-check / write-back sync script itself; and
- adding the routines-API tool to the **implementer** routine's `allowed_tools` (its only
  consumer). Giving a code-writing agent authority to reconfigure the factory is a real
  authority expansion, bounded to running the sync script over a human-reviewed diff — taken
  only when there is something to use it.

## Accepted trade-off: the 14-hour re-review gap

The live rebaser runs at 16:15, outside the overnight chain. A rebased `needs-qa` PR is
re-tested by the 17:00 qa run the same afternoon, but a rebased `needs-review` PR waits for
the 06:00 reviewer the next morning (~14h). The schedule is kept deliberately; the
`reviewer.order_after` edge for `rebaser` is recorded `realized: false` with a note, and the
contract test asserts that annotation matches the crons.
