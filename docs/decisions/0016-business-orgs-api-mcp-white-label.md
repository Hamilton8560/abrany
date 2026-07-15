---
id: 0016
title: Business orgs — assigned training, partner API/MCP, white-label certificates
status: proposed
owner: claude
date: 2026-07-15
---

## Context

David wants companies on Abrany: a business signs its employees up, assigns them
education with deadlines, tracks how long they spend reading each section, and
gets a clear pass/fail. Employees keep making their own curricula. Companies
must also be able to author curricula with **any AI model they run** (Claude
Code, GPT, in-house) by API or MCP, and the certificates their people earn
should carry the company's logo — white-labeled, "under American Iron", with
Abrany still visible as the issuer.

## Decision

- **Orgs on the existing single-tenant spine.** New tables `orgs`,
  `org_members`, `org_invites`, `assignments`. An assignment creates a normal
  goal **owned by the employee** — every existing feature (plans, lessons,
  exams, SRS, timer, certificates) works on it unchanged; the org only holds a
  tracking record pointing at the goal. Personal goals stay untouched next to
  assigned ones.
- **Invites auto-accept at signup.** Adding an email that has no account makes
  an `org_invites` row; signup with that email joins the org silently. Existing
  accounts join immediately.
- **Reading time = heartbeat column.** `lessons.read_sec` accumulates via a
  20-second visible-tab heartbeat from the open lesson viewer, clamped
  server-side at 60s/ping. No new table: a lesson already belongs to exactly
  one user via the goal chain.
- **Pass/fail derives from the exam gate we already built.** Passed = final
  exam passed (or goal formally completed); failed = deadline elapsed without a
  pass; a late pass flips it back with a `passed late` marker. Status is
  recomputed and latched on read — no cron.
- **One partner surface, three doors.** `lib/orgApi.ts` holds shared
  build/serialize logic consumed by (1) the in-app admin dashboard
  (`/app/org`), (2) REST `/api/v1/*` and (3) MCP `/api/mcp` — a dependency-free
  streamable-HTTP JSON-RPC handler (initialize / tools/list / tools/call).
  Auth for 2–3 is the org's `abr_org_…` bearer key. `create_assignment`
  accepts a complete curriculum (milestones → lessons with markdown content);
  sections without content stay generatable by the employee's in-app AI.
- **White-label = snapshot at issue time.** `certificates` gains
  `org_id/org_name/org_logo` copied from the assigning org when the credential
  is issued, so later rebrands don't rewrite history. The certificate renders
  the company logo + name as the headline brand with "ISSUED IN PARTNERSHIP
  WITH ABRANY" beneath; the public verify page says "completed X *under
  American Iron* on Abrany".

## Consequences

- Zero new dependencies; the MCP endpoint is ~200 lines of route handler.
- The employer sees per-section reading time, focus time, exam scores and
  pass/fail live; the employee sees deadlines and the company note on their
  Company page and studies exactly as before.
- Deleting an assignment stops tracking but leaves the employee's course — the
  goal is theirs by design.
- MVP constraint: one org per user (first membership wins) and the API key is
  org-wide; per-seat scoped keys can come later if needed.
- Curriculum pushed via API lands fully formed (plan + sections + exams), so
  external AI quality is the company's responsibility; Abrany still runs the
  exams and grading.

## Review

- Verified end-to-end on a scratch DB: invite → auto-join at signup → API
  curriculum push → heartbeats accumulate → exam pass → assignment `passed` →
  certificate issued with org branding; past-due assignment reports `failed`;
  cross-tenant heartbeat 404s; MCP initialize/tools/list/tools/call all answer;
  missing key → 401. `tsc --noEmit` and `next build` clean.
