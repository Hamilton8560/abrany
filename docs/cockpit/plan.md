# Plan — Abrany personal brain trainer

What's shipped and what's next. Tick as they land (Superpowers keeps this current).

- [x] App shell + brand reuse (glass sidebar, live queue badge)
- [x] Pomodoro timer + session recording + training log
- [x] Goals & learning objectives + AI plans (MiniMax M3)
- [x] Streaming coach chat (markdown rendering)
- [x] MiniMax FIFO concurrency queue (cap 2, backoff)
- [x] Milestone → lessons → generated markdown content
- [x] Durable job queue + background worker (async, restart-safe)
- [x] Universal mode-adaptive lesson kata
- [x] Scope gate: decompose oversized goals into tracks
- [x] Web-grounding for time-sensitive lessons (Brave Search)
- [x] Pluggable TTS (free browser voice now, HD by config later)
- [x] Mermaid diagrams (free, client-side) in lessons + coach chat
- [x] Assessments + spaced follow-ups (SM-2 review queue, self-rated, zero-cost)
- [x] "Quiz me" — coach generates + grades fresh questions per review
- [ ] Kokoro free-neural TTS bridge (optional, self-hosted)
- [x] Architecture diagrams (TOON → dagre → branded SVG, deterministic)
- [ ] Real image diagrams (Higgsfield / MiniMax Image — paid, on demand)
- [x] Presentations (AI markdown decks, diagrams, present + PDF)
- [x] Kimi Code as swappable / load-balanced 2nd LLM provider
- [x] Book-writing (outline → async chapters → reader)
- [x] Business orgs: employers sign employees up, invites auto-accept at signup
- [x] Assigned education with deadlines + pass/fail (exam-gated, late-pass aware)
- [x] Per-section reading-time tracking (lesson viewer heartbeat)
- [x] Employer dashboard (/app/org): team, assignments + live progress, branding, API key
- [x] Partner REST API (/api/v1) — author curricula with any AI model
- [x] MCP endpoint (/api/mcp) — plug Abrany into Claude Code / any MCP client
- [x] White-label certificates (company logo + name, "in partnership with Abrany")
- [x] Strategy report: why plans feel generalized + V2 design (docs/reports/…)
- [x] V2 plans: intake → outcome-first milestones, hours math, difficulty ramp, capstone (legacy v1 untouched)
- [x] Course editing: rename/reorder/add/delete milestones & sections (Edit course mode)
- [x] Course marketplace: publish with tags/age group, browse, one-click clone (progress reset)
- [x] Community forums: 4 age groups + 8 interests, threads & replies
- [x] "Your Mind" — OKF knowledge constellation (R3F), RPG progression, anatomical brain shell + level-ups
- [x] Personalized tutor memory (learner profile digest + durable `<remember>` facts)
- [x] Email notifications (Resend, summit-labs.io): team sign-up temp password + forced reset,
      certificate-earned, weekly progress report, per-user toggles in Settings

## Org Programs — author once, deploy multilingually, monitor in your language (spec 2026-07-19, awaiting review)

- [ ] Program library: data model (`programs`/`program_milestones`/`program_lessons`) + CRUD + in-app AI authoring (brief → draft → edit → save)
- [ ] Deploy-to-many: bulk `createAssignment` from a program, stamp `assignments.program_id`, skip duplicates
- [ ] Author-once auto-localize: stamp `source_lang`, pre-enqueue per-employee translation on deploy
- [ ] Monitor in your language: program engagement dashboard grouped by program (source-language content)
- [ ] Partner parity: `/api/v1/programs` + MCP tools writing the same library
