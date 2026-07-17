import { NextResponse } from "next/server";
import { addMemberByEmail } from "@/lib/org";
import {
  orgFromRequest,
  buildAssignment,
  memberJson,
  assignmentsJson,
  assignmentDetailJson,
} from "@/lib/orgApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP endpoint (streamable HTTP, JSON responses) so a company can plug Abrany
 * into Claude Code, Claude Desktop or any MCP client and author curricula with
 * whatever AI model they run. Auth = the org's partner API key:
 *
 *   claude mcp add --transport http abrany https://<host>/api/mcp \
 *     --header "Authorization: Bearer abr_org_..."
 */

const PROTOCOL = "2025-03-26";

const lessonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    objective: { type: "string" },
    kind: { type: "string", enum: ["read", "teach", "practice", "apply", "check", "review"] },
    content: {
      type: "string",
      description:
        "Full markdown lesson content authored by your AI. Omit to leave the section for the employee's in-app AI to generate.",
    },
  },
  required: ["title"],
};

const TOOLS = [
  {
    name: "list_employees",
    description: "List the members of your organization on Abrany.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_employee",
    description:
      "Sign an employee up to your organization by email. Existing Abrany accounts join immediately (with a heads-up email); a brand-new email gets a real account created on the spot and is emailed a temporary password they must reset on first login.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string" },
        role: { type: "string", enum: ["member", "admin"] },
      },
      required: ["email"],
    },
  },
  {
    name: "create_assignment",
    description:
      "Assign education to an employee, optionally with a deadline and a complete curriculum (milestones → lessons with markdown content) authored by any AI model. Abrany tracks reading time per section, exam scores and pass/fail against the deadline.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "The employee's email (must be a member)" },
        title: { type: "string", description: "The course/goal title" },
        description: { type: "string" },
        note: { type: "string", description: "A note from the company shown with the assignment" },
        dueAt: { type: "string", description: "Deadline as an ISO date, e.g. 2026-08-01" },
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              estimate: { type: "string" },
              lessons: { type: "array", items: lessonSchema },
            },
            required: ["title"],
          },
        },
      },
      required: ["email", "title"],
    },
  },
  {
    name: "list_assignments",
    description:
      "List every assignment with live progress: sections done, reading time, focus time, final-exam score and pass/fail status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_assignment",
    description: "One assignment in depth: per-section reading time, completion, grades and exams.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
];

type Rpc = { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> };

const rpcResult = (id: Rpc["id"], result: unknown) =>
  NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });

const rpcError = (id: Rpc["id"], code: number, message: string, status = 200) =>
  NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });

const toolText = (data: unknown, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

export async function POST(request: Request) {
  const org = orgFromRequest(request);
  if (!org)
    return NextResponse.json(
      { error: "Invalid or missing API key. Send Authorization: Bearer abr_org_..." },
      { status: 401 },
    );

  const msg = (await request.json().catch(() => null)) as Rpc | null;
  if (!msg || typeof msg.method !== "string") return rpcError(null, -32700, "Parse error", 400);

  // notifications carry no id and expect no body
  if (msg.id === undefined || msg.id === null) return new Response(null, { status: 202 });

  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "abrany", version: "1.0.0" },
        instructions:
          `You are connected to ${org.name}'s Abrany training workspace. ` +
          "Use the tools to sign employees up, assign education with deadlines and full curricula, and read live progress (reading time per section, exams, pass/fail).",
      });
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: TOOLS });
    case "tools/call": {
      const name = (msg.params?.name ?? "") as string;
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        switch (name) {
          case "list_employees":
            return rpcResult(msg.id, toolText({ members: memberJson(org) }));
          case "add_employee": {
            const email = (args.email ?? "").toString().trim().toLowerCase();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
              return rpcResult(msg.id, toolText({ error: "Enter a valid email" }, true));
            const r = await addMemberByEmail(org.id, email, args.role === "admin" ? "admin" : "member");
            // never expose the temp password over MCP — it's emailed to the employee only
            return rpcResult(msg.id, toolText({ status: r.status }));
          }
          case "create_assignment": {
            const r = buildAssignment(org, args);
            if ("error" in r) return rpcResult(msg.id, toolText({ error: r.error }, true));
            return rpcResult(msg.id, toolText({ assignment: assignmentDetailJson(org, r.assignment.id) }));
          }
          case "list_assignments":
            return rpcResult(msg.id, toolText({ assignments: assignmentsJson(org) }));
          case "get_assignment": {
            const detail = assignmentDetailJson(org, Number(args.id));
            if (!detail) return rpcResult(msg.id, toolText({ error: "Assignment not found" }, true));
            return rpcResult(msg.id, toolText({ assignment: detail }));
          }
          default:
            return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
        }
      } catch (err) {
        return rpcResult(
          msg.id,
          toolText({ error: err instanceof Error ? err.message : String(err) }, true),
        );
      }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** No server-initiated stream — clients operate request/response. */
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
