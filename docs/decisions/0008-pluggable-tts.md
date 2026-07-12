---
id: 0008
title: Pluggable, dynamically-swappable TTS provider
status: approved
owner: david
date: 2026-07-12
---

## Context
Spoken lessons ("verbal / lectures") are wanted now for free, with a paid HD voice later —
without rework when switching.

## Decision
A provider-agnostic TTS layer: browser `speechSynthesis` (free default) → Kokoro / OpenAI /
MiniMax T2A selected by `TTS_PROVIDER` env. Any provider failure falls back to the free
browser voice. Same "Listen" button throughout.

## Consequences
Free today; HD by a one-line config flip. MiniMax TTS needs its separate media key + GroupId
(not the `sk-cp` coding key).

## Review
David requested it be "dynamically capable."
