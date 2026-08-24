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
| **status** | `status: blocked`, `status: in-progress`, `status: needs-plan`, `status: needs-plan-review`, `status: agent-ready` (issues); `status: needs-review`, `status: needs-qa`, `status: approved` (PRs) | Where it stands. Issues: `needs-plan-review` = plan awaits human approval. PRs: `needs-review` → `needs-qa` → `approved` (ready for human merge). |
| **area** | `area: persistence`, `area: coaching`, `area: ui`, `area: pwa`, `area: auth`, `area: analytics` | Part of the app affected. |

Use the namespaced `type: enhancement` / `type: security` labels; the bare legacy
`enhancement` / `security` labels are not part of the taxonomy and no longer exist on the repo.

> Note: `labels.yml` is the single source of truth and is synced automatically. The
> [`label-sync` workflow](../.github/workflows/label-sync.yml) runs `github-label-sync` on
> pushes to `main` that touch `.github/labels.yml` (and on manual dispatch): it creates and
> updates every label listed in the file **and deletes any repo label that is not listed**.

### Dependency-blocked issues

If an issue cannot be started until another GitHub issue is completed, it must not enter the
planner queue. Triage should add `status: blocked` without adding a comment. The dependency
should already be clear from the issue's existing context. This is for a real prerequisite,
not merely a related issue; uncertain or optional relationships should be mentioned as
context and the issue can still be planned.

Triage rechecks dependency-blocked issues on later runs. When all referenced blocker issues
are closed, it removes `status: blocked` and adds `status: needs-plan`; no issue-body edit or
new comment is required. While any blocker remains open, the issue stays `status: blocked`.
Missing-information blocks and issues blocked after implementation remain human-owned. The
latter follow the existing PR resume path described in [the agent pipeline](../.claude/agents/README.md):
the human puts the blocked PR back to `status: in-progress`.

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
PR. Full detail in [`.claude/agents/README.md`](../.claude/agents/README.md).

## 7. When to write an ADR

Add an [Architecture Decision Record](adr/) for any decision that changes something
structural: the **data schema**, the **persistence** layer, the **auth** model, a **core
dependency**, or a cross-cutting pattern. Don't rewrite an accepted ADR to reverse it — add a
new one and mark the old as superseded. See [adr/README.md](adr/README.md).
