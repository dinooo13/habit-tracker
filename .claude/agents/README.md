# Agent pipeline

Seven repo-committed agents (`triage`, `planner`, `implementer`, `rebaser`, `reviewer`,
`qa-tester`, `docs-auditor`) drive the issue → plan → PR → review factory described in
[`docs/WORKFLOW.md`](../../docs/WORKFLOW.md).
Each agent handles **one** work item with fresh context; the cloud **routines**
(claude.ai/code/routines) are thin orchestrators that only build the queue, spawn one
agent per item, and summarize. All per-item logic lives here, versioned and reviewable.

## Label state machine

Status lives on the **issue** until a PR exists; from then on the dev ↔ review
ping-pong is driven by the **PR** label alone. This split-brain was previously the main
source of stuck items.

```
ISSUE:  (new, no status) ──triage──▶ needs-plan ──planner──▶ needs-plan-review ──human──▶ agent-ready ──implementer──▶ in-progress ──(PR merges, Closes #N)──▶ closed
                   └─▶ duplicate (no status) / blocked (missing info or dependency)
                                             └─ dependency blockers all closed → needs-plan

PR:     in-progress (draft) ──implementer: gates green──▶ needs-review ──reviewer: approve──▶ needs-qa ──qa: pass──▶ approved ──▶ human merges
                    ▲                                          │                                 │
                    └────── reviewer / qa: changes requested ──┴─────────────────────────────────┘
        (implementer blocked ⇢ PR **and** issue → status: blocked — exits every queue
         until a human puts the PR back to in-progress)

PR (stale vs main):
        needs-review ──rebaser: clean OR self-resolved small conflict──▶ needs-review (new head; reviewer re-runs per SHA marker; audit comment on self-resolve)
        needs-qa     ──rebaser: clean OR self-resolved small conflict──▶ needs-qa     (preview redeploys; qa re-runs per SHA marker; audit comment on self-resolve)
        approved     ──rebaser: clean OR confident self-resolve──▶ approved (stays merge-ready; audit comment on self-resolve)
        approved     ──rebaser: self-resolve, fresh pass warranted──▶ needs-qa (audit comment)
        any of the three ──rebaser: big conflict / red gates──▶ in-progress (marker comment = implementer queue)
```

Queues:

- **triage routine** → open issues with **no** `status:` label and no `duplicate` label,
  plus open issues labeled `status: blocked`; the triage agent decides whether a blocked
  issue is eligible for dependency rechecking
- **planner routine** → open issues labeled `status: needs-plan`
- **implementer routine** → open PRs labeled `status: in-progress` (resume), then open
  issues labeled `status: agent-ready` without an open PR (start)
- **rebaser routine** → open PRs labeled `status: needs-review`, `status: needs-qa`, or
  `status: approved` that are behind `origin/main` (the need check runs in the agent:
  current branches, docs-only drift, drafts, and fork PRs are skips, not work;
  `status: in-progress` and `status: blocked` are excluded — the implementer owns those)
- **reviewer routine** → open PRs labeled `status: needs-review` without a
  `<!-- routine:code-review sha={head} -->` comment for the current head SHA
- **qa routine** → open PRs labeled `status: needs-qa` (set by the reviewer on
  approve). PRs with no preview deployment (e.g. docs-only) are marked
  `status: approved` directly — QA not applicable.
- **docs-audit routine** → no queue; one whole-repo audit per run, feeding one
  docs-only PR into the reviewer queue (marker `<!-- routine:docs-audit -->`)

Dependency blocks are label-only: triage sets `status: blocked` while any explicit prerequisite
is open and, on a later run, replaces it with `status: needs-plan` once every prerequisite is
closed. The agent rechecks only issues whose body or existing human comments name the
prerequisites and which have no open PR; missing-information and later-pipeline blocks remain
human-owned.

Review and QA are **sequenced**, each the sole consumer of its own label: the reviewer
reads the diff (`needs-review`), then the qa-tester drives the deployed preview
(`needs-qa`, `https://preview.habits.fmeyer.dev/pr-{P}/`). Either bounces the PR back
to `status: in-progress`, where the implementer treats the blocking findings from both
comment types as its work queue; a fixed SHA re-enters at `needs-review`.
**`status: approved` is the merge-ready signal** — review and QA have both passed, and
the PR has left every agent queue. One label, one writer at a time: no race, and no
nightly no-op runs on PRs that are just waiting for a human.

Markers (idempotency): `<!-- routine:plan-issues -->` (plan comment on the issue),
`<!-- routine:triage -->` (triage comment, only on duplicates or missing-information blocks),
`<!-- routine:dev-progress -->` (progress section **in the PR body** — comment editing
is unavailable in the routine toolset, PR bodies are editable via
`update_pull_request`), `<!-- routine:code-review sha=… -->` (review comment per SHA),
`<!-- routine:qa sha=… -->` (QA comment per SHA), `<!-- routine:docs-audit -->`
(docs-audit PR body), `<!-- routine:rebase -->` (rebaser bounce, demotion, **or
self-resolution audit** comment on the PR — no per-SHA variant: rebaser idempotency is
structural, a rebased branch is no longer behind).

A rebaser force-push intentionally invalidates the per-SHA review/QA markers: the code
sits on a new base, so re-review/re-QA at the new head is correct, not waste — and the
routine ordering (rebaser after the implementer, before reviewer/qa) makes that re-run
happen the same cycle.

## Routine prompts

Paste these as the routine prompts; keep them thin — anything per-item belongs in the
agent files, not the routine.

### Triage routine (e.g. nightly, before planner)

> You are a non-interactive orchestrator for `dinooo13/habit-tracker`. Build the queue from
> two searches: (1) every open issue that has no `status:` label and no `duplicate` label
> (`search_issues`:
> `repo:dinooo13/habit-tracker is:issue is:open -label:"status: needs-plan"
> -label:"status: needs-plan-review" -label:"status: agent-ready"
> -label:"status: in-progress" -label:"status: needs-review" -label:"status: blocked"
> -label:duplicate`); and (2) every open issue labeled `status: blocked`. For the second
> result set, let the triage agent determine whether dependency rechecking applies. If both
> searches are empty, report "nothing to triage" and stop. For each, spawn one
> fresh `triage` agent (subagent_type: "triage") — "Triage issue #{N}" — one agent per
> issue, never reused. Collect only each verdict. Finish with a summary: queued for
> planning, unblocked, duplicates, blocked (missing information or dependency), skipped.
> Never label, plan, or change anything yourself.

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

### Rebaser routine (e.g. nightly, after the implementer, before the reviewer)

> You are a non-interactive orchestrator for `dinooo13/habit-tracker`. Fetch every open
> PR labeled `status: needs-review`, `status: needs-qa`, or `status: approved`
> (`search_pull_requests`). If none, report "nothing to rebase" and stop. For each,
> spawn one fresh `rebaser` agent (subagent_type: "rebaser") with isolation:
> "worktree" — "Rebase PR #{P}" — one agent per PR, never reused; agents may run in
> parallel (branches are independent). Collect only each outcome. Finish with a
> summary: rebased (clean / self-resolved, label kept / self-resolved, demoted to
> needs-qa), bounced to in-progress (big conflict or red gates), skipped (current /
> docs-only drift / draft). Never resolve conflicts you are not confident about, and
> never review, merge, or push to main yourself.

The routine passes every candidate; the *agent* performs the cheap behind/need check in
git — keeping the routine thin per the rule above. Run it once per cycle, after the
implementer routine and any human merges — not per merge — so a merge burst costs each
stale PR a single rebase.

### Reviewer routine (e.g. nightly, after the rebaser)

> You are a non-interactive orchestrator for `dinooo13/habit-tracker`. Fetch every open
> PR labeled `status: needs-review` (`search_pull_requests`:
> `repo:dinooo13/habit-tracker is:pr is:open label:"status: needs-review"`). For each,
> spawn one fresh `reviewer` agent (subagent_type: "reviewer") with isolation:
> "worktree" — "Review PR #{P}" — one agent per PR, never reused. Collect only verdict,
> blocking count, comment link. Finish with a summary: approved (awaiting human merge),
> sent back to in-progress, skipped (already reviewed at head). Never review, fix, push,
> or merge yourself.

### QA routine (e.g. nightly, after the reviewer)

> You are a non-interactive orchestrator for `dinooo13/habit-tracker`. Fetch every open
> PR labeled `status: needs-qa` (`search_pull_requests`:
> `repo:dinooo13/habit-tracker is:pr is:open label:"status: needs-qa"`). For each,
> spawn one fresh `qa-tester` agent (subagent_type: "qa-tester") — "QA PR #{P}" — one
> agent per PR, never reused. Collect only verdict, blocking count, comment link.
> Finish with a summary: approved (passed / QA not applicable), issues found (sent back
> to in-progress), still waiting on a preview deploy. Never test, fix, push, or merge
> yourself.

Note: the routine's cloud environment must allow the domain
`preview.habits.fmeyer.dev` in its network access settings, or every preview fetch
will fail with `403 host_not_allowed`.

### Docs-audit routine (e.g. weekly)

> You are a non-interactive orchestrator for `dinooo13/habit-tracker`. Spawn one fresh
> `docs-auditor` agent (subagent_type: "docs-auditor") with isolation: "worktree" and
> the prompt "Audit the docs". Relay its report: PR link (or "docs in sync"), fix
> count, and any items needing human attention. Do not audit or fix anything yourself.

## Humans in the loop

Two gates are deliberately human: promoting a plan (`status: needs-plan-review` →
`status: agent-ready` on the issue) and merging a PR labeled `status: approved` — the
signal that both code review and QA have passed. Everything else runs unattended.
