/**
 * URL-embedded auth variant of /api/mcp. Same MCP handler — the org key rides in
 * the path (`/api/mcp/abr_org_…`) instead of an Authorization header, so connectors
 * that only accept a URL (Claude Desktop / claude.ai custom connectors) can connect.
 * orgFromRequest() reads the key straight off the request URL, so the parent POST
 * handler works unchanged; we just re-export it under this segment.
 */
export { POST, GET } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
