# Agent pipeline

Seven repo-committed agents (`triage`, `planner`, `implementer`, `rebaser`, `reviewer`,
`qa-tester`, `docs-auditor`) drive the issue → plan → PR → review factory described in
[`docs/WORKFLOW.md`](../../docs/WORKFLOW.md).
Each agent handles **one** work item with fresh context; the T3 Code **scheduled tasks**
(one fresh top-level thread per run, prompt = `.factory/prompts/{stage}.md`) are thin
orchestrators that only build the queue, spawn one agent per item, and summarize. All
per-item logic lives here, versioned and reviewable.

The pipeline is also described machine-readably in
[`.factory/factory.yml`](../../.factory/factory.yml) — a descriptive manifest of every
stage's queue, label transitions, idempotency guard, and live schedule/model, plus a
top-level `markers:` registry (ADR-0023), guarded by a contract test (ADR-0021, ADR-0023,
ADR-0025). This README stays the human-facing architecture; the manifest is what a machine
diffs against the live T3 task config.

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

- **triage task** → open issues with **no** `status:` label and no `duplicate` label,
  plus open issues labeled `status: blocked`; the triage agent decides whether a blocked
  issue is eligible for dependency rechecking; open issues labeled `status: draft` are
  excluded from the query and, as a second line of defence, skipped by the agent
- **planner task** → open issues labeled `status: needs-plan`
- **implementer task** → open PRs labeled `status: in-progress` (resume), then open
  issues labeled `status: agent-ready` without an open PR (start)
- **rebaser task** → open PRs labeled `status: needs-review`, `status: needs-qa`, or
  `status: approved` that are behind `origin/main` (the need check runs in the agent:
  current branches, docs-only drift, drafts, and fork PRs are skips, not work;
  `status: in-progress` and `status: blocked` are excluded — the implementer owns those)
- **reviewer task** → open PRs labeled `status: needs-review` without a
  `<!-- routine:code-review sha={head} -->` comment for the current head SHA
- **qa task** → open PRs labeled `status: needs-qa` (set by the reviewer on
  approve). PRs with no preview deployment (e.g. docs-only) are marked
  `status: approved` directly — QA not applicable.
- **docs-audit task** → no queue; one whole-repo audit per run, feeding one
  docs-only PR into the reviewer queue (marker `<!-- routine:docs-audit base=… -->`,
  keyed on the `origin/main` head the audit ran against)

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
`<!-- routine:triage kind=duplicate|missing-information -->` (triage comment, only on
duplicates or missing-information blocks — the typed kind lets triage's fingerprint guard
recognize its own prior comment; a legacy untyped `<!-- routine:triage -->` still matches
by prefix), `<!-- routine:dev-progress -->` (progress section **in the PR body** — the
single resume point, edited in place via `gh api -X PATCH …/pulls/{P} -F body=@-`), `<!-- routine:code-review sha=… -->` (review comment per SHA),
`<!-- routine:qa sha=… -->` (QA comment per SHA), `<!-- routine:docs-audit base=… -->`
(docs-audit PR body, keyed on the `origin/main` head it was audited against so a stale
audit is distinguishable from a current one), `<!-- routine:rebase -->` (rebaser bounce,
demotion, **or self-resolution audit** comment on the PR — no per-SHA variant: rebaser
idempotency is structural, a rebased branch is no longer behind).

The `routine:` prefix in marker ids is a stable identifier kept for backward compatibility
with existing comments and the ADR-0023 producer/consumer check; it does not refer to
claude.ai routines.

The whole marker graph — one producer and ≥1 consumers per marker — is recorded
machine-readably in the [`.factory/factory.yml`](../../.factory/factory.yml) `markers:`
registry, and each stage's guard `kind` / `marker` / `note` sits in its `idempotency`
block (ADR-0023). Every stage follows one convention: **claim with the durable artifact
(comment, branch, or PR), flip the queue-state label last, and stay in your own queue** so
a run that dies mid-way is retried for free — no transient status labels. The guards are
advisory, not exclusive; a single scheduler stays a standing constraint.

A rebaser force-push intentionally invalidates the per-SHA review/QA markers: the code
sits on a new base, so re-review/re-QA at the new head is correct, not waste. The rebaser
runs at 16:15, so a rebased `needs-qa` PR is re-tested by the 17:00 qa run that same
afternoon, while a rebased `needs-review` PR waits for the 06:00 reviewer the next
morning. The re-run always happens; only its latency differs by stage.

## Environment

`scripts/setup-agent-env.sh` is the one environment contract, shared by every caller:
every T3 thread via the `SessionStart` hook in `.claude/settings.json` (with
`--no-browser`, including scheduled runs), `.devcontainer/devcontainer.json`
(`postCreateCommand`), and humans on a fresh checkout. It is idempotent — a warm environment costs ~0.2s.

Two tiers, deliberately:

- **Required** — node ≥22 and `npm ci`. Failure exits non-zero; an agent that sees this
  must report a broken environment rather than proceeding or exiting silently.
- **Best-effort** — `@playwright/cli`, a chromium binary, and `.playwright/cli.config.json`. Failure prints
  **`PLAYWRIGHT_UNAVAILABLE`** and still exits 0: the implementer notes it in the PR body
  and lets CI's `e2e` job cover the suite (`implementer.md` §5), and the qa-tester cannot
  run at all and must report rather than fake a pass.

**Host prerequisite for QA.** Scheduled runs never install browser tooling: the
qa-tester task only checks that `playwright-cli` is on the host and reports "browser
unavailable" if not. On the factory host, `@playwright/cli` (global) and its Chromium are
installed once by hand, or by running this script without `--no-browser`. The agent needs
no skill: `playwright-cli --help` documents the commands.

## Task prompts

Each task's orchestrator prompt is kept **verbatim** in its own file under
[`.factory/prompts/`](../../.factory/prompts/) — one file per stage, holding only the exact
text set as the task prompt (ADR-0021, ADR-0025). Keep them thin: anything per-item belongs
in the agent files, not the task. The cadences in the headings below are the **live run
times**, machine-local (the host runs UTC), also recorded in
[`.factory/factory.yml`](../../.factory/factory.yml) as `runtime.runs`. A stage with
several times is several tasks sharing one prompt.

### Triage task (22:01 daily, machine-local; host runs UTC)

[`.factory/prompts/triage.md`](../../.factory/prompts/triage.md)

### Planner task (23:00 daily, machine-local; host runs UTC)

[`.factory/prompts/planner.md`](../../.factory/prompts/planner.md)

### Implementer task (02:00, 11:00, 21:00 daily, machine-local; host runs UTC)

[`.factory/prompts/implementer.md`](../../.factory/prompts/implementer.md)

### Rebaser task (16:15 daily, machine-local; host runs UTC)

[`.factory/prompts/rebaser.md`](../../.factory/prompts/rebaser.md)

The task passes every candidate; the *agent* performs the cheap behind/need check in
git — keeping the task thin per the rule above. Run it once per cycle, after the
implementer task and any human merges — not per merge — so a merge burst costs each
stale PR a single rebase.

### Reviewer task (06:00, 16:00 daily, machine-local; host runs UTC)

[`.factory/prompts/reviewer.md`](../../.factory/prompts/reviewer.md)

### QA task (07:00, 17:00 daily, machine-local; host runs UTC)

[`.factory/prompts/qa-tester.md`](../../.factory/prompts/qa-tester.md)

Note: the task runs on the maintainer's machine, which must reach
`preview.habits.fmeyer.dev`; there is no network allowlist to configure.

### Docs-audit task (16:00 daily, machine-local; host runs UTC)

[`.factory/prompts/docs-auditor.md`](../../.factory/prompts/docs-auditor.md)

### Managing the tasks

The eleven tasks (one per `runtime.runs` entry) are created with `schedule_task`, listed
with `list_scheduled_tasks`, changed with `update_scheduled_task`, removed with
`delete_scheduled_task`, and smoke-tested with `run_scheduled_task_now` — all from a T3
thread in the `habit-tracker` T3 project, since those tools exist nowhere else. All eleven
were created **disabled**; a human enables them after a manual run and mirrors the flip
into `factory.yml`. Runs happen only while T3 is up on the host, and each run starts a
fresh top-level thread in a new worktree branched from `origin/main`. See
[`.factory/README.md`](../../.factory/README.md) for the sync convention.

## Humans in the loop

Two gates are deliberately human: promoting a plan (`status: needs-plan-review` →
`status: agent-ready` on the issue) and merging a PR labeled `status: approved` — the
signal that both code review and QA have passed. Everything else runs unattended.

Beyond the two gates, one state is entirely human-owned: `status: draft` (pre-pipeline,
requirements still being written). Agents neither set, clear, nor act on it.
