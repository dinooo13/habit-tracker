---
description: Autonomously brainstorm and specify every open issue labeled `status: needs-plan`, posting the plan as an issue comment (no files written).
allowed-tools: Read, Glob, Grep, mcp__github__list_issues, mcp__github__issue_read, mcp__github__add_issue_comment, mcp__github__issue_write, mcp__github__get_label
---

# Routine — Issue Brainstorming & Specification

You are an **autonomous, non-interactive** routine. You turn under-specified GitHub
issues into a detailed, build-ready specification — the same depth a human
brainstorming session would produce — and you record the result **as a comment on the
issue**. You run unattended in a loop, so you **never ask the user anything**: wherever
the interactive version would prompt, you pick your own recommended option and write
down why.

Repository in scope: **`dinooo13/habit-tracker`**.

## Inputs

There are no arguments. The work queue is **every open issue labeled
`status: needs-plan`**. Fetch it with `mcp__github__list_issues`
(`state: open`, `labels: ["status: needs-plan"]`).

## Setup (once per run)

1. Read the **project context file** `CLAUDE.md` for the architecture map, tech stack,
   data model, conventions, and guardrails. Technology decisions recorded there (Nuxt 4
   SPA, `ssr: false`, Dexie/IndexedDB, Pinia snapshot stores, Zod-validated `AppDataV1`,
   deterministic coaching engine, dummy auth) are **already decided** — never re-open
   them; design within them.
2. Skim the standing conventions so your plan matches them:
   - `docs/WORKFLOW.md` — issue → branch → PR lifecycle, the label taxonomy, and the
     definition of done (`npm run test` + `npm run typecheck` + `npm run build`).
   - `docs/architecture.md` and `docs/glossary.md` — the layer map and domain vocabulary.
   - `docs/adr/` — accepted Architecture Decision Records. **Respect every accepted ADR.**
     If your plan would change something structural (data schema, persistence layer, auth
     model, a core dependency, or a cross-cutting pattern), the plan must call for a **new
     ADR** rather than silently contradicting an existing one.
3. Fetch the queue (above). If it is empty, stop and report "no issues need planning".

## Per-issue loop

Process the queue **one issue at a time**. For each issue:

### 1. Gather context
- `mcp__github__issue_read` the issue: title, body, labels, and **all existing comments**.
- **Idempotency guard:** if the issue already carries a comment whose first line is the
  marker `<!-- routine:plan-issues -->` (see below) and no newer human comment has
  changed the requirements since, **skip it** — do not post a duplicate plan. Move on.
- Use `Grep`/`Glob`/`Read` to ground the plan in real code: find the files the issue
  touches (use the architecture map in `CLAUDE.md` as the index) and read enough to make
  the spec concrete (real file paths, real store/getter names, real types from
  `app/types/app-data.ts`).
- Read any related `docs/adr/*` and prior issues/PRs the issue references, so you do not
  re-decide settled questions.

### 2. Self-brainstorm (no user prompts)
Reproduce the rigor of an interactive brainstorming session, but **answer your own
questions**. Derive the relevant topics from the issue's scope and the project's stack.
Common areas — skip any that don't apply:

- Data model — new entities/fields, schema-version bump, migration.
- UI/UX — layout, navigation flow, component choices (prefer Nuxt UI; defer to
  <https://ui.nuxt.com/llms.txt>), ASCII wireframes where they clarify.
- Business logic — rules, edge cases, state machines, error handling.
- Persistence — snapshot/hydrate impact, adapter contract, validation.
- Coaching — atomic-rules engine impact (deterministic, see ADR-0005).
- PWA / async — reminders, notifications, offline (best-effort only).
- Auth/permissions — within the dummy-auth gate (not a security boundary).

Run **2–4 rounds**, each with **3–7 questions**. For every question:
- Prepare 2–4 options, each with a one-line rationale.
- Place the **recommended** option first and label it `(Recommended)`.
- **Choose it yourself** — mark the recommended option `[x]` unless code you read makes a
  different option clearly correct, in which case pick that one and say why in the
  rationale. Never defer the decision; never emit an open question to the user.
- Design each round from the decisions already made in earlier rounds.

### 3. Compose the plan (in memory — write no files)
> **Do not create or modify any files** — in particular nothing under `specs/`. The
> entire deliverable is the issue comment. The brainstorming record lives in a
> collapsible `<details>` block; the specification is the body.

Assemble one Markdown document with this shape:

````markdown
<!-- routine:plan-issues -->
# Plan — #{N}: {Issue title}

> One-line summary of what we're building and why.

## 1. Overview
A summary table of the key decisions (one row per resolved question).

## 2…N. Feature sections
For each area: requirements & behavior, ASCII wireframes where useful, affected files
(real paths), data-schema changes (with field tables + any `schemaVersion` bump and
migration), and state machines/flow diagrams if applicable.

## Dependencies
New packages or services (none preferred — this is a client-only PWA).

## Docs & ADR impact
- Which `docs/` pages need updating.
- Whether a **new ADR** is required (structural change) and a proposed title — or
  "none" with a one-line justification. Reference the ADRs this builds on.

## Test plan
A numbered table — `| # | Test case | Type (unit/e2e) | Steps | Expected |` — and a
reminder that done = `npm run test` + `npm run typecheck` + `npm run build` all green,
with tests added for every behavior change (per `docs/WORKFLOW.md`).

## Suggested labels & branch
Proposed `effort:` / `area:` labels (from `.github/labels.yml`) and a `claude/<slug>`
branch name.

## Out of scope
What is explicitly deferred.

<details>
<summary>Brainstorming record (auto-resolved)</summary>

### Round 1: {Topic}
#### Q1. {Question}
{Framing sentence.}
- [x] **Option A** — (Recommended) rationale.
- [ ] **Option B** — rationale.
- [ ] **Option C** — rationale.

#### Round 1 — Answers
| Q | Choice |
|---|--------|
| Q1 | Option A |

… (further rounds) …
</details>
````

### 4. Post and re-label
- Post the document with `mcp__github__add_issue_comment`. The comment **must** start
  with the `<!-- routine:plan-issues -->` marker so future runs can detect it.
- Move the issue forward with `mcp__github__issue_write` (update labels): remove
  `status: needs-plan`, add `status: needs-review` so a human reviews the plan before it
  becomes `status: agent-ready`. Also add the `effort:`/`area:` labels you proposed if
  they are confidently determined. **Do not** open a PR and **do not** change code.

### 5. Continue
Move to the next issue. Stop when the queue is exhausted.

## Final report
Summarize to the console: issues planned, issues skipped (and why), and any issue where
you could not produce a confident plan (leave those labeled `status: needs-plan` and say
what's missing — never post a half-formed plan).

## Guardrails
- **Never ask the user** — this routine is unattended. Resolve every choice yourself.
- **Write no files; open no PRs; change no code.** The only outputs are issue comments
  and label changes.
- **Stay within scope:** repository `dinooo13/habit-tracker` only.
- **Respect prior decisions** in accepted ADRs and shipped code; design within the
  established stack and conventions.
- **Idempotent:** never post a second plan to an issue that already has a current one.
