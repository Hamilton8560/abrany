---
id: 0011
title: Architecture diagrams from a TOON spec via dagre
status: proposed
owner: claude
date: 2026-07-12
---

## Context
Mermaid covers flows/timelines/state well, but system/architecture diagrams look nicer as
color-coded boxes-and-arrows. The alternative (an LLM free-drawing HTML/SVG, like the Cocoon-AI
skill) has no layout engine and produces overlapping, inconsistent output — the exact failure
seen in the cockpit's demo diagram. David proposed keeping the "emit a structured spec, transcribe
to JSON, let an engine lay it out" approach.

## Decision
For architecture diagrams the coach emits an ```arch code block containing a compact TOON spec
(`nodes[N]{id,label,group}` + `edges[M]{from,to,label}`). We parse the TOON (`lib/toon.ts`),
auto-lay-it-out with **dagre**, and render clean branded SVG (`components/app/ArchDiagram.tsx`)
with nodes color-coded by group (frontend/backend/service/data/external/queue). Detection is by
```arch tag or a `nodes[N]{...}` content match; parse/layout failure falls back to the raw spec.
Mermaid stays for flows/sequences/timelines/state.

## Consequences
Deterministic layout (no overlaps), reliable for MiniMax to generate (structure, not coordinates),
and a more "designed" look than a flowchart. Adds one dependency (`@dagrejs/dagre`). Note: the
dagre graph must be created with `{ multigraph: true }` since edges are set with names.

## Review
Proposed — ratify the TOON→dagre→SVG approach for architecture diagrams (this is David's own idea,
built out).
