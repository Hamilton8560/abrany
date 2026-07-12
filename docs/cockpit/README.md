# Dev Cockpit — bundle

A local visual command surface for the Claude Code + Superpowers workflow. See `WORKFLOW.md`
for the full design.

## What's here

- `cockpit.html` — the app. Open it in **Chrome or Edge**, click **Open repo /docs**, point it at
  your repo's `docs/` folder. It round-trips files to disk (File System Access API). Opens in a
  live **demo** immediately so you can explore before connecting anything.
- `WORKFLOW.md` — the design doc: the loop, the file conventions, and the TOON/JSON/Markdown policy.
- `CLAUDE-cockpit-block.md` — paste into your project's `CLAUDE.md` so Claude Code drives the loop.
- `docs/` — a ready-to-copy scaffold (sample plan, ADRs, feedback, TOON snapshot) so the cockpit
  has something to show on first connect. Copy `docs/` into your repo root.

## 60-second start

1. Open `cockpit.html` in Chrome/Edge — you'll see the demo (a ledger service).
2. Click **Open repo /docs** and select the `docs/` folder from this bundle (or your repo's).
3. Draw on the canvas, approve/reject decisions, tick plan tasks, write a note in the Feedback rail.
4. Click **Sync for Claude** — it writes `cockpit-state.toon` + `feedback.md` your agent reads next.
5. In your repo, install Superpowers and paste the `CLAUDE.md` block. Run the loop.

## Notes

- The canvas engine (Excalidraw) loads from `unpkg.com`; you need a connection the first time.
- No browser storage is used; everything lives in your repo files. That's the point — it's git-native.
