# The Elite Claude Code Workflow: Brain + Cockpit

A software-engineering workflow that pairs an agentic *methodology* (Superpowers) with a
local *visual command surface* (the Cockpit) so that architecture, decisions, plans, and
mockups are things you **see and steer**, not prose you skim.

Last updated: July 2026.

---

## 1. The core idea

Most people run Claude Code as brain-only: brainstorm → plan → code, all in text. That's
powerful but blind. You can't *see* the architecture, you can't *annotate* a decision, and
your approvals live in scrollback. The fix is a two-layer stack:

- **The brain** — [Superpowers](https://github.com/obra/superpowers) (v6.1.1, July 2026).
  Still the reference methodology: brainstorm → git worktree → detailed plan → subagent-driven
  TDD → review. Nothing has replaced it; it just doesn't try to be visual.
- **The eyes and hands** — the **Cockpit**: a local app over your repo that renders the living
  architecture canvas, a decision board, the current plan, and pinned UI mockups — all backed
  by plain files in `/docs` that Claude Code reads and writes.

They meet at the filesystem. The Cockpit never talks to Claude directly; it writes files, and
Claude reads them next turn. That keeps the whole thing tool-agnostic and git-native.

---

## 2. The loop

```
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   Superpowers (Claude Code)          Cockpit (you)          │
  │   ────────────────────────           ─────────────          │
  │                                                             │
  │   brainstorm ──► plan.md ──────────► [Plan panel]           │
  │        │                                  │ check/comment    │
  │        ▼                                  ▼                  │
  │   architecture.excalidraw ─────────► [Canvas]  annotate ──┐  │
  │        │                                                  │  │
  │        ▼                                                  │  │
  │   proposes ADRs ───────────────────► [Decisions] approve ─┤  │
  │        │                              /reject/comment     │  │
  │        ▼                                                  │  │
  │   generates mockups ───────────────► [Mockups]  pin/note ─┤  │
  │        │                                                  │  │
  │        ▼                                                  ▼  │
  │   reads  ◄───────────────── feedback.md + cockpit-state.toon │
  │   (your annotations become binding constraints)             │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
```

You are the reviewer in the loop. Claude proposes on the canvas and the decision board; you
draw on it, approve or reject, and drop comments. Those edits become files. On its next turn
Claude reads `feedback.md` (your prose) and `cockpit-state.toon` (the machine state) and treats
your approvals as constraints it is not allowed to violate.

---

## 3. File conventions (`/docs`)

Everything the Cockpit and Claude share lives under `/docs`, so it's versioned with the code.

```
docs/
├── cockpit/
│   ├── architecture.excalidraw   # living system diagram — Claude writes, you annotate
│   ├── plan.md                   # current Superpowers plan, task checkboxes
│   ├── feedback.md               # your prose notes → Claude reads this first each turn
│   ├── cockpit-state.toon        # compact machine snapshot of decisions+plan for Claude
│   └── mockups/                  # PNG/SVG mockups, one per component/screen
│       └── *.png
└── decisions/                    # ADRs — one Markdown file per decision
    └── NNNN-title.md
```

### ADR format (`docs/decisions/NNNN-title.md`)

```markdown
---
id: 0007
title: Use event sourcing for the ledger
status: proposed        # proposed | approved | rejected | superseded
owner: claude
date: 2026-07-12
---

## Context
Why this decision is on the table.

## Decision
What we're proposing to do.

## Consequences
Trade-offs, what it costs, what it unlocks.

## Review
<!-- cockpit appends your comments here -->
```

The Cockpit flips `status` and appends your comment under `## Review`. **`status: approved`
is your go signal** — Claude treats approved ADRs as hard constraints and rejected ones as
forbidden paths.

---

## 4. Format policy: TOON vs JSON vs Markdown

You asked whether to use [TOON](https://github.com/toon-format/toon) instead of JSON. The right
answer is *selectively* — TOON is an input-optimization format, not a universal JSON replacement.

**Use TOON** for the data you feed *into* Claude's context, especially uniform/tabular records:
the decision board (a list of `{id, title, status, owner}`), the plan's task list, a component
inventory. This is exactly where TOON's benchmarked **30–60% token savings** land, because it
factors out repeated keys into a header row. The Cockpit emits `cockpit-state.toon` for this.

**Keep JSON** where a tool owns the format. `architecture.excalidraw` *is* JSON by definition —
the Excalidraw renderer reads nothing else, and it's deeply nested and non-uniform, which is
precisely the shape where TOON's advantage shrinks or reverses. Don't fight the tool.

**Keep Markdown** where humans read and git diffs matter: ADRs, `plan.md`, `feedback.md`. These
are for you and for review; token efficiency is not the constraint there, legibility is.

Rule of thumb: **TOON for reading state in, native format for tools, Markdown for humans.** A
note from the 2026 benchmark ([arXiv:2603.03306](https://arxiv.org/abs/2603.03306)): TOON wins
decisively on *feeding* structured data to a model, but when you force a model to *generate*
constrained nested output, JSON-with-constrained-decoding is often more reliable — another
reason to let Claude keep writing `.excalidraw` as JSON and reserve TOON for the read path.

`cockpit-state.toon` looks like this:

```toon
decisions[3]{id,title,status,owner}:
  0005,Adopt hexagonal boundaries,approved,claude
  0006,Postgres over Dynamo for core,approved,david
  0007,Event sourcing for the ledger,proposed,claude
plan.tasks[4]{n,task,status}:
  1,Extract domain ports,done
  2,Wire Postgres adapter,in_progress
  3,Ledger write model,todo
  4,Projection rebuild job,todo
```

---

## 5. The visual layer — why Excalidraw

The 2026 landscape splits diagramming into: static images (throwaway), code-first
(Mermaid/D2 — great for PR review, bad for freeform annotation), and **live-editable canvases
the agent can read and write** (Excalidraw). For a human-in-the-loop review surface you want the
last one: the `.excalidraw` file is JSON, so Claude generates it *and* reads your hand-drawn
annotations back — the same agent that changes the code updates the diagram in the same session.
Mermaid stays useful for the PR-embedded, git-diffable view; the Cockpit canvas is where you
actually think.

---

## 6. Getting started

1. **Install the brain.** In your repo: install Superpowers (see its README), so `/brainstorm`,
   planning, and subagent TDD are available in Claude Code.
2. **Drop in the conventions.** Copy the `docs/` scaffold from this bundle into your repo and
   paste the `CLAUDE.md` block (in `CLAUDE-cockpit-block.md`) into your project's `CLAUDE.md`.
3. **Open the Cockpit.** Open `cockpit.html` in Chrome/Edge, click *Open repo /docs folder*, and
   point it at your repo's `docs/` directory. Draw, decide, comment.
4. **Run the loop.** Ask Claude to draft the architecture and ADRs; review them in the Cockpit;
   let Claude read your feedback and iterate.
```
