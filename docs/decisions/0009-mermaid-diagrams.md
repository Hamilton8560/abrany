---
id: 0009
title: Mermaid for free, client-side diagrams
status: proposed
owner: claude
date: 2026-07-12
---

## Context
Visual/spatial subjects (electrical engineering, geopolitics timelines, military tactics,
anatomy relationships) are under-served by prose. Real image generation costs credits, but a
large share of "diagrams" are structural — flows, timelines, hierarchies, state machines —
which don't need pixels.

## Decision
Render ```mermaid code blocks as diagrams client-side (Mermaid.js). The coach (already free on
the MiniMax subscription) emits Mermaid for structural concepts. Detection is by language tag
OR content keyword (MiniMax often omits the ```mermaid tag), and rendering falls back to the
raw code on any parse error.

## Consequences
Free (no image API); covers the structural half of the "diagrams" modality.

The cost of this decision is that a model authors a punctuation-sensitive grammar by hand, and
gets it slightly wrong often enough to matter: measured against 19 realistic generated blocks,
8 failed to parse and collapsed into the "couldn't render" box. `lib/mermaidRepair.ts` is the
answer — a repair pass run as a second attempt after the source as written, covering the slips
we actually observed (unquoted labels, prose inside the fence, unicode arrows, reserved words
as node ids, tails left dangling by a truncated response). It takes that sample to 0 failures
and is regression-tested in both directions against the real parser. If the failure classes
keep growing, the alternative is validating diagrams server-side at generation time and asking
the model to fix its own — a separate decision, not needed at the current hit rate. Real illustrations
(photos, rich figures) still need a paid image provider (Higgsfield / MiniMax Image) — tracked
separately. `securityLevel: loose` is used because the diagram source is our own trusted LLM.

## Review
Proposed — ratify Mermaid as the free diagram path (the paid image half is a separate decision).
