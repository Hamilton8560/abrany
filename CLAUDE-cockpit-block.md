<!-- Paste this block into your project's CLAUDE.md -->

## Dev Cockpit protocol

This repo uses the **Dev Cockpit** for human-in-the-loop architecture review. State the human
steers lives under `docs/`. Follow this protocol every session.

**Read first, every turn:**
1. `docs/cockpit/feedback.md` — David's prose notes. Treat as the highest-priority instruction.
2. `docs/cockpit/cockpit-state.toon` — machine snapshot of decisions + plan (TOON, not JSON).
   Parse the tabular blocks: `decisions[N]{id,title,status,owner}`, `plan.tasks[N]{n,task,status}`,
   optional `comments[N]{id,note}`.

**Decision rules (non-negotiable):**
- An ADR with `status: approved` is a **hard constraint**. Do not propose alternatives to it.
- An ADR with `status: rejected` is a **forbidden path**. Do not reintroduce it.
- `status: proposed` is yours to argue for or revise. If David commented, address the comment.
- To propose a new decision, write `docs/decisions/NNNN-title.md` using the ADR template
  (frontmatter: id, title, status: proposed, owner: claude, date; sections Context / Decision /
  Consequences / Review). Never set status to approved yourself.

**Architecture canvas:**
- Maintain `docs/cockpit/architecture.excalidraw` (Excalidraw JSON — keep it JSON, it must render).
- When you change the system's structure in code, update the canvas in the same turn.
- Read David's hand-drawn annotations back from the file before your next structural change.

**Plan:**
- Keep `docs/cockpit/plan.md` current with Superpowers-style checkbox tasks (`- [ ]` / `- [x]`).
- Do not re-check or uncheck tasks David has toggled unless the code state truly changed.

**Mockups:**
- Drop generated UI mockups in `docs/cockpit/mockups/` as PNG/SVG. Read `_notes.json` for David's
  per-mockup requests and address them.

**Format policy:** TOON for reading state in (uniform records), JSON only where a tool owns the
format (`.excalidraw`), Markdown for everything humans review (ADRs, plan, feedback).
