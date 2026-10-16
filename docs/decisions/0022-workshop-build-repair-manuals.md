---
id: 0022
title: Workshop (beta) — LEGO-style build & repair manuals with step illustrations
status: proposed
owner: claude
date: 2026-10-16
---

## Context
David is doing more hands-on work and uses AI to plan it, and he likes how LEGO manuals are
laid out. He asked for a beta that handles construction and maintenance of any size, from
building a house in El Salvador to fixing a Chinese treadmill. It has to cover electrical and
mechanical problems, walk through troubleshooting and then the repair, and use pictures to
explain the steps. Lessons are prose-first, and that format fails at this: hands-on work
needs an inventory, small physical steps, a way to know each step went right, and pictures.

## Decision
A separate **Workshop** surface (`/app/workshop`, `lib/workshop.ts`, table `manuals`). It is
not a lesson kind.

- **One JSON manual shape for both kinds.** A *build* manual is phases of steps. A *repair*
  manual adds a yes/no **troubleshooting tree**. Each answer leads to another check, a fix
  procedure, "call a pro" or "done". Each step holds a title, 1–4 concrete actions, the parts
  and tools it uses (LEGO callout), a check, a caution, and a `figure` (the picture
  description). The manual also carries safety and stop-and-call-a-pro lists, an inventory,
  and aftercare (tests plus a maintenance schedule).
- **`normalizeManual` is the only gate.** Model output is coerced field by field. Dangling
  tree references go to "pro" rather than a dead end, and a manual with no steps throws, so
  the job retries.
- **The flowchart is generated, not authored.** `troubleshootMermaid` builds the mermaid from
  the tree with sanitised ids and quoted labels, so it cannot fail to parse. The model never
  writes this diagram.
- **Illustrations use MiniMax image-01** (about $0.0035 each). The prompt sets an
  instruction-booklet style and bans text in the image, because image models garble it. They
  are drawn in a separate `generate_manual_images` job, 3 per run, and the job re-queues
  itself, so pictures never hold a worker slot for long and never delay the text. Images are
  stored as JPEGs on the data volume. Who pays follows the text rule: server-powered users
  use the server key, BYO MiniMax users use their own key, and everyone else gets a manual
  without pictures.
- Content, image state and ticked-off progress are separate columns, so the image job and
  the reader's clicks never overwrite each other.

## Consequences
The pictures illustrate the steps. They are not accurate technical drawings: hands can look
odd and wiring is not exact. Specs, ratings and safety live in the text, and every manual
carries a beta disclaimer. Big builds such as a house are covered at phase level in one
generation. Expanding a single phase into its own manual is a likely next step. Still open:
photo upload for diagnosis (needs a vision-capable model path), "ask about this step" in the
tutor, and expanding a phase into its own manual.

## Review
David to decide: keep image generation on by default, or make it opt-in per manual? Should
Workshop go into the employee/B2B path (maintenance SOPs for American Iron)?
