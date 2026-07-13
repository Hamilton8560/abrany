---
id: 0012
title: Presentations as AI-authored markdown decks
status: proposed
owner: claude
date: 2026-07-12
---

## Context
The original vision includes "creating presentations." The cheapest, most reliable path reuses
what we already have rather than adding a slide framework or LLM-free-drawn HTML.

## Decision
The coach (MiniMax) writes a deck as GitHub-flavored markdown with slides separated by a `---`
line. We render it with the existing Markdown component, so every slide can carry headings,
bullets, tables, Mermaid diagrams, and `arch` architecture diagrams for free. Generation runs
async through the existing `jobs` queue + worker (`generate_presentation`); the UI polls. The
`SlideDeck` viewer gives keyboard nav, progress, fullscreen "Present" mode, and print-to-PDF.

## Consequences
Free (LLM already on the subscription), deterministic, fully on-brand, and diagrams work in
slides with zero extra code. Real photographic images in slides would still need a paid image
provider (tracked separately). No fancy transitions (reveal.js could be added later if wanted).

## Review
Proposed — ratify markdown-decks + our renderer as the presentations approach (vs. reveal.js or
LLM-free-drawn HTML slides).
