# Agent pipeline

Seven repo-committed agents (`triage`, `planner`, `implementer`, `rebaser`, `reviewer`,
`qa-tester`, `docs-auditor`) drive the issue → plan → PR → review factory described in
[`docs/WORKFLOW.md`](../../docs/WORKFLOW.md).
Each agent handles **one** work item with fresh context; the cloud **routines**
(claude.ai/code/routines) are thin orchestrators that only build the queue, spawn one
agent per item, and summarize. All per-item logic lives here, versioned and reviewable.

The pipeline is also described machine-readably in
[`.factory/factory.yml`](../../.factory/factory.yml) — a descriptive manifest of every
stage's queue, label transitions, idempotency guard, and live schedule/model, guarded by a
contract test (ADR-0021). This README stays the human-facing architecture; the manifest is
what a machine diffs against the live routine config.

## Label state machine

Status lives on the **issue** until a PR exists; from then on the dev ↔ review
ping-pong is driven by the **PR** label alone. This split-brain was previously the main
source of stuck items.

```
ISSUE:  draft ──human removes the label──▶ (new, no status) ──triage──▶ needs-plan ──planner──▶ needs-plan-review ──human──▶ agent-ready ──implementer──▶ in-progress ──(PR merges, Closes #N)──▶ closed
        (human-only,                                  └─▶ duplicate (no status) / blocked (missing info or dependency)
         no queue)                                                              └─ dependency blockers all closed → needs-plan

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
  issue is eligible for dependency rechecking; open issues labeled `status: draft` are
  excluded from the query and, as a second line of defence, skipped by the agent
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
sits on a new base, so re-review/re-QA at the new head is correct, not waste. The rebaser
runs at 16:15, so a rebased `needs-qa` PR is re-tested by the 17:00 qa run that same
afternoon, while a rebased `needs-review` PR waits for the 06:00 reviewer the next
morning. The re-run always happens; only its latency differs by stage.

## Environment

`scripts/setup-agent-env.sh` is the one environment contract, shared by every caller:
the cloud routines (which run it as their setup step), `.devcontainer/devcontainer.json`
(`postCreateCommand`), the `SessionStart` hook in `.claude/settings.json`
(with `--no-browser`), and humans on a fresh checkout. It is idempotent — a warm
environment costs ~0.2s.

Two tiers, deliberately:

- **Required** — node ≥22 and `npm ci`. Failure exits non-zero; an agent that sees this
  must report a broken environment rather than proceeding or exiting silently.
- **Best-effort** — `@playwright/cli`, the `playwright-cli` skill that `qa-tester`
  declares, a chromium binary, and `.playwright/cli.config.json`. Failure prints
  **`PLAYWRIGHT_UNAVAILABLE`** and still exits 0: the implementer notes it in the PR body
  and lets CI's `e2e` job cover the suite (`implementer.md` §5), and the qa-tester cannot
  run at all and must report rather than fake a pass.

Editing the script changes the repo half only. The cloud routines invoke it by path, so a
rename or a new required flag needs a matching routine edit in the claude.ai/code UI.

## Routine prompts

Each routine's orchestrator prompt is kept **verbatim** in its own file under
[`.factory/prompts/`](../../.factory/prompts/) — one file per stage, holding only the exact
text configured in the routine (ADR-0021). Keep them thin: anything per-item belongs in the
agent files, not the routine. The cadences in the headings below are the **live crons**
(UTC), also recorded in [`.factory/factory.yml`](../../.factory/factory.yml).

### Triage routine (22:01 UTC daily)

[`.factory/prompts/triage.md`](../../.factory/prompts/triage.md)

### Planner routine (23:00 UTC daily)

[`.factory/prompts/planner.md`](../../.factory/prompts/planner.md)

### Implementer routine (02:00, 11:00, 21:00 UTC daily)

[`.factory/prompts/implementer.md`](../../.factory/prompts/implementer.md)

### Rebaser routine (16:15 UTC daily)

[`.factory/prompts/rebaser.md`](../../.factory/prompts/rebaser.md) — records the **live**
routine text, which lags the agent's current self-resolution wording (no `self-resolved`
summary bucket; "Never resolve conflicts, review, merge, or push to main yourself" rather
than "…conflicts *you are not confident about*"). The agent file `rebaser.md` governs
behavior; re-aligning the routine is a deferred sync op — see
[`.factory/README.md`](../../.factory/README.md).

The routine passes every candidate; the *agent* performs the cheap behind/need check in
git — keeping the routine thin per the rule above. Run it once per cycle, after the
implementer routine and any human merges — not per merge — so a merge burst costs each
stale PR a single rebase.

### Reviewer routine (06:00, 16:00 UTC daily)

[`.factory/prompts/reviewer.md`](../../.factory/prompts/reviewer.md)

### QA routine (07:00, 17:00 UTC daily)

[`.factory/prompts/qa-tester.md`](../../.factory/prompts/qa-tester.md)

Note: the routine's cloud environment must allow the domain
`preview.habits.fmeyer.dev` in its network access settings, or every preview fetch
will fail with `403 host_not_allowed`.

### Docs-audit routine (16:00 UTC daily)

[`.factory/prompts/docs-auditor.md`](../../.factory/prompts/docs-auditor.md)

## Humans in the loop

Two gates are deliberately human: promoting a plan (`status: needs-plan-review` →
`status: agent-ready` on the issue) and merging a PR labeled `status: approved` — the
signal that both code review and QA have passed. Everything else runs unattended.

Beyond the two gates, one state is entirely human-owned: `status: draft` (pre-pipeline,
requirements still being written). Agents neither set, clear, nor act on it.
