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
Free (no image API); covers the structural half of the "diagrams" modality. Real illustrations
(photos, rich figures) still need a paid image provider (Higgsfield / MiniMax Image) — tracked
separately. `securityLevel: loose` is used because the diagram source is our own trusted LLM.

## Review
Proposed — ratify Mermaid as the free diagram path (the paid image half is a separate decision).
