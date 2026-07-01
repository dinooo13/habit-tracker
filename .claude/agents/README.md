# Agent pipeline

Three repo-committed agents (`planner`, `implementer`, `reviewer`) drive the
issue → plan → PR → review factory described in [`docs/WORKFLOW.md`](../../docs/WORKFLOW.md).
Each agent handles **one** work item with fresh context; the cloud **routines**
(claude.ai/code/routines) are thin orchestrators that only build the queue, spawn one
agent per item, and summarize. All per-item logic lives here, versioned and reviewable.

## Label state machine

Status lives on the **issue** until a PR exists; from then on the dev ↔ review
ping-pong is driven by the **PR** label alone. This split-brain was previously the main
source of stuck items.

```
ISSUE:  needs-plan ──planner──▶ needs-review ──human──▶ agent-ready ──implementer──▶ in-progress ──(PR merges, Closes #N)──▶ closed
                                                                                     (stays in-progress; blocked ⇢ status: blocked)

PR:     in-progress (draft) ──implementer: gates green, ready──▶ needs-review ──reviewer: approve──▶ (stays; human merges)
                    ▲                                                │
                    └────────────── reviewer: changes requested ─────┘
```

Queues:

- **planner routine** → open issues labeled `status: needs-plan`
- **implementer routine** → open PRs labeled `status: in-progress` (resume), then open
  issues labeled `status: agent-ready` without an open PR (start)
- **reviewer routine** → open PRs labeled `status: needs-review` without a
  `<!-- routine:code-review sha={head} -->` comment for the current head SHA

Markers (idempotency): `<!-- routine:plan-issues -->` (plan comment on the issue),
`<!-- routine:dev-progress -->` (progress section **in the PR body** — comment editing
is unavailable in the routine toolset, PR bodies are editable via
`update_pull_request`), `<!-- routine:code-review sha=… -->` (review comment per SHA).

## Routine prompts

Paste these as the routine prompts; keep them thin — anything per-item belongs in the
agent files, not the routine.

### Planner routine (e.g. nightly)

> You are a non-interactive orchestrator for `dinooo13/habit-tracker`. Fetch every open
> issue labeled `status: needs-plan` (`mcp__github__list_issues`). If none, report "no
> issues need planning" and stop. For each issue, spawn one fresh `planner` agent
> (subagent_type: "planner") with the prompt "Plan issue #{N}" — one agent per issue,
> never reused. Collect only each agent's short report. Finish with a summary: planned,
> skipped (why), unplannable (what's missing). Do not plan, write files, or change code
> yourself.

### Implementer routine (e.g. nightly, after planner)

> You are a non-interactive orchestrator for `dinooo13/habit-tracker`. Build the queue:
> (1) resume — open PRs labeled `status: in-progress`; (2) start — open issues labeled
> `status: agent-ready` with no open PR referencing them. For each item, spawn one fresh
> `implementer` agent (subagent_type: "implementer") with isolation: "worktree" —
> "Resume PR #{P}" or "Implement issue #{N}" — one agent per item, never reused. Items
> touching the same files run sequentially; otherwise agents may run in parallel in the
> background. Collect only outcomes (PR link, gate results, blockers). Finish with a
> summary: started, resumed, ready for review, skipped (no plan), blocked (where). Never
> implement anything yourself, never push to main, never merge.

### Reviewer routine (e.g. nightly, after implementer)

> You are a non-interactive orchestrator for `dinooo13/habit-tracker`. Fetch every open
> PR labeled `status: needs-review` (`search_pull_requests`:
> `repo:dinooo13/habit-tracker is:pr is:open label:"status: needs-review"`). For each,
> spawn one fresh `reviewer` agent (subagent_type: "reviewer") with isolation:
> "worktree" — "Review PR #{P}" — one agent per PR, never reused. Collect only verdict,
> blocking count, comment link. Finish with a summary: approved (awaiting human merge),
> sent back to in-progress, skipped (already reviewed at head). Never review, fix, push,
> or merge yourself.

## Humans in the loop

Two gates are deliberately human: promoting a plan (`status: needs-review` →
`status: agent-ready` on the issue) and merging an approved PR. Everything else runs
unattended.
