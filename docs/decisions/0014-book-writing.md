---
id: 0014
title: Book-writing — outline then chapter-by-chapter
status: proposed
owner: claude
date: 2026-07-12
---

## Context
The original vision includes "write books." A book is far longer than a lesson or deck, so
generating it in one call would overwhelm the model's context and produce shallow output.

## Decision
Two-stage generation, mirroring goals→plans→lessons: (1) create a book from a brief and generate
an **outline** of chapters synchronously (small structured call); (2) generate **each chapter
independently** as an async job through the existing worker, passing only that chapter's title,
summary, and the outline for continuity — so every generation has bounded context and stays
coherent. Chapters render with the existing Markdown component (so diagrams work in chapters too).
The book page is a table of contents + a reader with prev/next chapter navigation.

## Consequences
Books of any length stay tractable — the only thing that scales is the number of small chapter
jobs, never a single request. Reuses the jobs/worker, Markdown renderer, and the same
generate/prepare pattern as lessons. Generation benefits from `LLM_PROVIDER=balanced` (chapters
spread across MiniMax + Kimi). No whole-book "download as .epub/.pdf" yet (print works per chapter).

## Review
Proposed — ratify outline-then-async-chapters as the book approach.
