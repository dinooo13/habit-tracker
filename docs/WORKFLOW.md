# Development Workflow

How work flows from an idea to merged code in this repository. The conventions below reflect
how the project already operates (see issues #6–#8 and PRs #3/#5/#9) and codify sane defaults.

## 1. Requirements live in GitHub issues

Every new requirement, feature idea, or bug starts as a **GitHub issue** — that's the backlog
and the source of truth for *what* to build. Use the issue templates in
[`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/):

- **Feature / improvement** — structured as `## Problem` → `## Proposed Solution` →
  `## Trade-offs` (optional) → `## Effort` (Small / Medium / Large). Reference concrete files
  where helpful (the existing issues cite `app/...` paths).
- **Bug report** — Description → Steps to reproduce → Expected vs Actual → Environment.

## 2. Triage & labels

When an issue comes in, label it. Every issue should get at least a **type** and an
**effort**; add **priority** and **area** when known. The taxonomy (also defined for syncing in
[`.github/labels.yml`](../.github/labels.yml)):

| Group | Labels | Use |
| --- | --- | --- |
| **type** | `type: feature`, `type: bug`, `type: enhancement`, `type: docs`, `type: refactor`, `type: test`, `type: chore`, `type: security` | What kind of work it is. |
| **priority** | `priority: high`, `priority: medium`, `priority: low` | How urgent. |
| **effort** | `effort: small`, `effort: medium`, `effort: large` | Rough size (mirrors the issue's *Effort* field). |
| **status** | `status: draft`, `status: blocked`, `status: in-progress`, `status: needs-plan`, `status: needs-plan-review`, `status: agent-ready` (issues); `status: needs-review`, `status: needs-qa`, `status: approved` (PRs) | Where it stands. Issues: `draft` = human-only, pre-pipeline — agents ignore it entirely; `needs-plan-review` = plan awaits human approval. PRs: `needs-review` → `needs-qa` → `approved` (ready for human merge). |
| **area** | `area: persistence`, `area: coaching`, `area: ui`, `area: pwa`, `area: auth`, `area: analytics`, `area: factory` | Part of the app affected — except `factory`, which is the agent pipeline itself. |

Use the namespaced `type: enhancement` / `type: security` labels; the bare legacy
`enhancement` / `security` labels are not part of the taxonomy and no longer exist on the repo.

> Note: `labels.yml` is the single source of truth and is synced automatically. The
> [`label-sync` workflow](../.github/workflows/label-sync.yml) runs `github-label-sync` on
> pushes to `main` that touch `.github/labels.yml` (and on manual dispatch): it creates and
> updates every label listed in the file **and deletes any repo label that is not listed**.

### Draft issues (human-only)

`status: draft` is the one **pre-pipeline** state, and the only label no agent ever touches.
Apply it when the issue's *content* is still undecided — you are filing a placeholder, or
composing requirements over several sittings. GitHub has draft pull requests but no draft
issues; this label is the equivalent, so half-formed ideas can live in the backlog instead of
a local scratch file, without triage consuming them.

- A **human** applies it, normally while creating the issue, and a **human** removes it.
  Agents never apply, remove, or act on it — a draft issue is in no queue.
- Removing the label leaves the issue with no `status:` label, i.e. the untriaged state, so
  the next triage run picks it up normally. That is the whole release mechanism.
- Keep it exclusive: `status: draft` should be the only `status:` label on the issue. If
  another one is present too, draft wins (agents skip) — remove the stale one.
- Draft is about undecided content, not sequencing. A fully specified issue that must wait
  for a prerequisite gets `status: blocked` (see below); work already in flight uses GitHub's
  native draft-PR state. The label is for issues only.
- The "every issue gets a type and an effort" rule above applies once the draft is released;
  a draft may carry no other labels.

### Dependency-blocked issues

When an issue body or existing human comment names an explicit prerequisite that is still
open, triage applies `status: blocked` without commenting. Closed, optional, speculative, and
merely related issues do not block planning.

Later triage runs recheck blocked issues. When every named prerequisite is closed and no open
PR references the issue, the agent changes only its status label from `status: blocked` to
`status: needs-plan`; otherwise it makes no change. Missing-information and later-pipeline
blocks remain human-owned, with blocked PRs following the resume path in
[the agent pipeline](../.claude/agents/README.md).

## 3. Branching

- Branch off `main`. One logical change per branch.
- Naming: `claude/<slug>` for agent-driven work (matches existing history), or
  `<type>/<short-slug>` for human work (e.g. `feat/pause-mode`, `fix/streak-reset`).
- Keep branches short-lived; rebase on `main` rather than letting them drift.

## 4. Pull requests

Open a PR using the [PR template](../.github/PULL_REQUEST_TEMPLATE.md):

- **Link the issue** with `Closes #N` (or `Refs #N` if it only partially addresses it).
- Sections: `## Summary`, `## Changes`, `## Test plan` (or `## Verification`).
- Keep PRs focused and reviewable; describe what was verified and what couldn't be.
- Squash-merge into `main`.

## 5. Definition of done

A change is done when all of the following hold (this is also the CI gate —
`.github/workflows/ci.yml`):

- `npm run lint` passes (ESLint + Stylistic; see [adr/0013](adr/0013-nuxt-eslint-flat-config.md)).
- `npm run test` passes.
- `npm run typecheck` passes.
- `npm run build` succeeds.
- Tests are added or updated for any behavior change (see [TESTING.md](TESTING.md)).
- Documentation is updated when relevant — including a new **ADR** when the change is
  structural.

## 6. Automation pipeline

Triage, planning, implementation, branch upkeep, first-pass review, acceptance QA on
the PR preview deployment, and documentation upkeep are automated by seven
repo-committed agents (`.claude/agents/`: `triage`, `planner`, `implementer`,
`rebaser`, `reviewer`, `qa-tester`, `docs-auditor`) driven by thin cloud routines. New issues without a `status:` label are
triaged automatically (labels + dedupe) into the planner queue. Status labels form the state machine: they live on the **issue** until a PR
exists (`needs-plan` → `needs-plan-review` → `agent-ready` → `in-progress`), then the
build → review → QA loop is driven by the **PR** label (`in-progress` → `needs-review`
→ `needs-qa` → `approved`, bouncing back to `in-progress` on findings). After merges
land on `main`, the `rebaser` keeps queued PRs (`needs-review` / `needs-qa` /
`approved`) rebased when they actually conflict or their CI/QA base went stale,
self-resolving small conflicts it is confident about (with an audit comment, keeping
their label including `approved`) and bouncing big or ambiguous conflicts or red gates
back to `status: in-progress` — operationalizing §3's "rebase on `main` rather than
letting them drift". Two
gates stay human: promoting a plan to `status: agent-ready`, and merging an approved
PR. One *state* is wholly human: `status: draft` marks a pre-pipeline issue whose
requirements are still being written — no agent applies, removes, or acts on it.
Every stage declares an idempotency guard in
[`.factory/factory.yml`](../.factory/factory.yml) (ADR-0023) so a re-run does not redo
finished work; the guards are advisory (they narrow the duplicate-work window rather than
close it), so running the cloud routines alongside a second scheduler at once stays a
standing constraint. Full detail in [`.claude/agents/README.md`](../.claude/agents/README.md).

## 7. When to write an ADR

Add an [Architecture Decision Record](adr/) for any decision that changes something
structural: the **data schema**, the **persistence** layer, the **auth** model, a **core
dependency**, or a cross-cutting pattern. Don't rewrite an accepted ADR to reverse it — add a
new one and mark the old as superseded. See [adr/README.md](adr/README.md).
