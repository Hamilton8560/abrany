<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Partner API (/api/v1)

- Routes live under `app/api/v1/`; shared auth, validation and serializers in `lib/orgApi.ts`; org data access in `lib/org.ts`.
- Auth: `Authorization: Bearer abr_org_…` resolved by `orgFromRequest` — always org-scope queries through it.
- Partner-facing docs are the "API & MCP" tab in `components/app/OrgPanel.tsx` — update it when endpoints change.
- Tests: `npm test` (node:test, lib-level only — `tests/hooks/resolve-ts.mjs` does not map the `@/` alias, so don't import route files).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
