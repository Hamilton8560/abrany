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
- [x] Partner focus-session stats: GET /api/v1/sessions — per member per UTC day, pomodoros (25+ min) + focus seconds
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

- [x] Program library: data model (`programs`/`program_milestones`/`program_lessons`) + CRUD + in-app AI authoring (brief → draft → edit → save) — Programs tab in OrgPanel, `/api/orgs/programs`, `generateProgramOutline`
- [x] Deploy-to-many: bulk `createAssignment` from a program, stamp `assignments.program_id`, skip duplicates — Deploy UI + `/api/orgs/programs/[id]/deploy`
- [x] Author-once auto-localize: stamp `source_lang`, pre-enqueue per-employee translation on deploy (via existing `deployProgram`)
- [ ] Monitor in your language: program engagement dashboard grouped by program (source-language content)
- [ ] Partner parity: `/api/v1/programs` + MCP tools writing the same library

## Draft with AI — a shared SMART co-pilot in front of every generation (ADR-0020, spec 2026-07-19)

- [x] Shared engine: isomorphic surface registry (`lib/draftSurfaces.ts`) + turn-based structured engine (`lib/draftAssistant.ts`) + `POST /api/draft`
- [x] Reusable `DraftAssistant` panel: ≤3 SMART questions + quick replies → editable draft → fills the parent form
- [x] Wired into all free-text surfaces: assignments, programs, goals, plan intake, presentations, books, study guides
- [x] SMART-directed prompts per surface; personal context (learnerProfile) + today's-date resolution; `mustDraft` escape hatch
- [ ] Later: co-pilot the Programs-monitor + partner API surfaces once built

## Commercial hardening — American Iron employee path + education quality (2026-09-04)

- [x] Org members inherit their company's AI (owner org → server keys; BYO owner → their key) — no more "add your key" for employees
- [x] Assign education → background `build_course` job (plan → sections → exams → content); employee opens a READY course
- [x] Just-in-time content: first 2 milestones eager, next milestone prefetched as the learner advances
- [x] Company-assigned courses are locked (no delete/rebuild/structural edits) with an employer banner + deadline
- [x] Assigned training surfaced first on Dashboard + Goals list (deadline, progress, status)
- [x] Exam integrity: cached study guide, server-issued + stored questions, graded by index vs the whole course, unlock gate (all scoped sections complete)
- [x] Password reset: public forgot-password, single-use token links, admin "Send reset link" (fixes trapped welcome email)
- [x] Assignment deadline/note editing; due dates = end of day; destructive actions confirm; 401 → login
- [x] `goalStats` / org progress scoped to the LATEST plan (rebuild used to double-count)
- [x] Chat: one thread per goal, capped history, 16k output budget, New conversation, dynamic provider label
- [x] Lesson-grounded tutor ("Ask the tutor" from any lesson) + hint-ladder teaching rules (TUTOR_SYSTEM)
- [x] Lesson generation calibrated to level/outcomes/sibling lessons; practice stages = warm-up/core/stretch + hints + worked answers
- [x] Interactive practice engine (ADR-0021): progressive problems, hint ladder, AI check, variants, debrief → section grade
- [x] Overlays rendered via Portal (modals opened off-screen inside backdrop-filter cards)
- [x] AI queue priority lanes: interactive requests never wait behind background generation
- [x] Worker wakes on app render / health probe (restarts no longer strand queued jobs)
- [x] Diagram repair pass (`lib/mermaidRepair.ts`): generated mermaid that *almost* parses now renders instead of collapsing into "couldn't render" — same fix serves presentations, books and goals
- [x] Mermaid module/chunk load failures retry once instead of caching a rejected import forever (one network flake used to kill every diagram until a hard reload)
- [x] Deck slides split fence-aware: a mermaid block's YAML frontmatter no longer shatters a presentation into extra slides
- [ ] Localized transactional emails (spec Part B) — not built
- [ ] Program monitor dashboard + partner `/api/v1/programs` — still open from the programs spec
- [ ] Require a passed practice set before "complete" on company assignments? (David's call, see ADR-0021)

## Workshop beta + diagram reliability (2026-10-16)

- [x] Workshop (ADR-0022): build & repair manuals in a LEGO-booklet layout — inventory, safety / call-a-pro, numbered step cards with parts callouts, checks and cautions, progress ticks, print to PDF
- [x] Repair manuals: yes/no troubleshooting wizard that lands on the fix procedure; full flowchart generated from the tree (always parses)
- [x] Step illustrations via MiniMax image-01 in a self-requeueing background job (3 per run), redraw per step
- [x] Diagrams: streaming coach replies no longer latch "couldn't render" (failure reset per source + debounce)
- [x] Diagrams: ```arch parser tolerates wrong row counts, header variants, quoted commas, label references; graceful fallback
- [x] Diagrams: whole-document fence unwrap no longer eats a trailing diagram's closing fence; mermaid detection case-insensitive, frontmatter-aware, never on inline code / other languages
- [x] Print rule for decks scoped so printing any other page isn't blank
- [ ] Photo upload for diagnosis (vision model path)
- [ ] Expand one build phase into its own detailed manual
- [ ] "Ask about this step" → tutor grounded in the manual

