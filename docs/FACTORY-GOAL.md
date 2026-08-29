# Factory goal — a portable software factory

> Status: **direction, not a plan.** Nothing here is implemented. A roadmap will be derived
> from this document separately.
>
> Last updated: 2026-08-29

## The goal

Evolve the agent pipeline that builds this repository into a **portable software factory**:
a versioned, reviewable, backend-neutral system that takes work from an issue tracker to
merged code, and that can run wherever we point it — today claude.ai routines, later a
devcontainer, GitHub Actions, or an always-on VM.

The factory should be good enough to improve itself: it observes its own runs, and files
issues against its own design.

## Why

The pipeline works today, but its control plane lives in a cloud UI. That has one concrete
consequence: **configuration drifts silently and cannot be diffed, reviewed, or tested.**
Two live examples found on 2026-08-25 — the rebaser is scheduled after both reviewer runs
so it never precedes a review, and model pins are split across routine config and agent
frontmatter with only one agent declaring one. Neither is a mistake anyone made; both are
what happens when config has nowhere to be reviewed. (Both examples were since re-verified
against live routine configuration and are tracked in #85.)

Moving the control plane into the repository fixes that class of problem, not just those
two instances.

## Current state (2026-08-25)

Seven agents in `.claude/agents/`, driven by seven cloud routines on cron. The state
machine is GitHub labels; the queue for each stage is a label query. Two human gates:
plan approval and merge.

What the cloud environment provides for free, and what portability must therefore replace:
`mcp__github__*` tooling, a `playwright-cli` binary, a prepared checkout with write auth,
worktree isolation, and push notifications.

## Target properties

1. **Versioned** — every stage definition, schedule, and ordering constraint lives in the
   repo and changes through a PR.
2. **Backend-neutral** — a stage runs unchanged in any environment that satisfies its
   declared capabilities.
3. **Tracker-pluggable** — GitHub today, Jira or Linear later, without rewriting agents.
4. **Observable** — every stage run emits a structured record; cross-run analysis is the
   input to improving the factory.
5. **Composable** — the same definitions drive both a horizontal sweep (one stage over many
   items) and a vertical pipeline (one item through every stage).

## Decisions

### Scope
- Abstract the **orchestration**, not the runtime. Claude Code remains the agent runtime;
  `.claude/agents/*.md` keep working, with subagents, worktree isolation, and skills.
- Backend choice is **deliberately deferred**. A devcontainer is the likely direction.

### Orchestration
- **Split the orchestrator.** A script owns the queue query — deterministic, cheap, testable.
  An agent owns fan-out and the run summary, where judgment is actually needed (for example,
  serializing implementer items that touch the same files).
- **A stage is one transition on one item**, not a batch job. This is the load-bearing
  choice: it is what allows the same definitions to drive a sweep and a vertical
  issue-to-done pipeline without writing the logic twice.
- **Ordering is intentional** — it encodes status order and rate limits — but becomes a
  declared property of the pipeline rather than something emergent from cron spacing.
  Concurrency and delay are stage fields.

### Tracker
- The issue tracker is the source of truth for what work to pick up. It must be pluggable.
- The adapter that replaces `mcp__github__*` **is** the tracker abstraction. It should be
  designed in neutral terms — `list_items(state)`, `set_state`, `comment`, `link_pr` — and
  not as a thin `gh` wrapper that would need re-abstracting later. Labels become a state
  vocabulary that GitHub happens to implement as labels.
- Agents must not call `gh` directly either; that re-couples them to one tracker.

### Full auto
- Running an item from plan to merge unattended must be **possible**, opt-in per item rather
  than the default, so blast radius is chosen deliberately.
- Human gates become policy fields on transitions, not hard-coded stops.
- Three mechanisms exist only because of this mode:
  - a **bounce loop bound** — park an item after N review/QA cycles instead of ping-ponging
    forever;
  - a **kill switch** reachable from a script, not a cloud UI toggle;
  - explicit acceptance that auto-merge means **unattended production deploys**, since
    `ci.yml` deploys production on push to `main`.

### Dry run
- A stage must be able to print its resolved queue and the exact prompts it would spawn,
  spawning nothing and touching nothing.
- Serves three purposes: de-risking a backend swap, giving the factory a test surface, and
  acting as a drift detector when compared against real run logs.

### Observability
- **Split by consumer.** Per-item narrative ("what happened to PR #78") stays as issue and
  PR comments — this already works and needs nothing. Cross-run aggregates ("which stage
  bounces most", "do reviewer and QA disagree") are the gap.
- The durable decision is the **record schema**; the sink is an adapter.
- Chosen sink: **one JSON file per stage run** under `factory/logs/`, committed to the repo.
  Unique paths mean concurrent runs never conflict; `paths-ignore` keeps log commits out of
  CI; monthly compaction to JSONL keeps the tree tidy.
- Watch the growth curve rather than predicting it. Langfuse Cloud is the fallback if
  querying becomes painful — schema-first means that is an added sink, not a migration.
- Capture bounce counts, reviewer-vs-QA agreement, and time-in-state from the first version.
  These are cheap to record and **impossible to reconstruct later**.
- This is what closes the loop: an analyst stage reads the log and files issues against the
  factory itself, which the factory then plans and implements.

## Non-goals

- Making the pipeline runtime-agnostic. Swapping Claude Code for another agent CLI would
  cost subagent spawning, worktree isolation, and skills, and buys nothing we want.
- Replacing the issue tracker as the state store. Its statelessness is the property that
  makes the factory portable in the first place.
- Building observability infrastructure. At roughly a hundred records a week, a file and
  `jq` answer the questions.

## Constraints and traps

- **Never run cloud routines and a second scheduler against the same repo simultaneously.**
  Reviewer and QA are protected by `<!-- routine:* sha={head} -->` idempotency markers.
  Triage, planner, and implementer are not, and would double-spawn — two branches, two PRs,
  one issue. Generalizing that marker pattern to every stage is a prerequisite for any
  second execution path, and is worth doing even if we never leave the cloud (filed as #86).
- A stage run should reconstruct everything it needs from the tracker. Run logs are the one
  deliberate exception; if any other design needs local state, that is a signal the design
  is wrong.
- Ephemeral environments mean the log sink must be external and authenticated from every
  backend. Local files are debug convenience only.

## Open questions

- Where the capability contract lives, and how a stage fails when a capability is missing —
  a QA stage that silently skips its browser walkthrough and reports a pass is the failure
  mode to design against.
- Whether one factory tick with declared stage order, or per-stage schedules, better serves
  the mix of cadences (implementer runs more often than reviewer; docs-auditor is weekly).
- What eligibility for full auto looks like in practice — an explicit label, or derived from
  effort and type.
- Whether `factory/` lives inside `.claude/` or beside it, given that stage definitions are
  meant to outlive any one runtime (#85 proposes `.factory/`).

## Known issues to fix regardless

- Rebaser runs at 16:15; reviewer runs at 06:00 and 16:00. Rebaser never precedes a review,
  which inverts the documented ordering. (Verified and tracked in #85.)
- Model configuration is split across two layers: routines pin `claude-opus-4-8` (triage
  pins `claude-sonnet-5`), while only `rebaser.md` declares a model in frontmatter.
  (Verified and tracked in #85.)
- `implementer.md` and `docs-auditor.md` declare no `tools:` list, while the other five
  enumerate theirs — the two agents that write code and push branches are the ones with the
  loosest declaration.
- The preview URL is hardcoded in `.claude/agents/qa-tester.md`.
