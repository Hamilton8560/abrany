import { NextResponse } from "next/server";
import { orgFromRequest, buildAssignment, assignmentsJson, assignmentDetailJson } from "@/lib/orgApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });

/** Partner API: every assignment with live progress (time, sections, pass/fail). */
export async function GET(request: Request) {
  const org = orgFromRequest(request);
  if (!org) return unauthorized();
  return NextResponse.json({ assignments: assignmentsJson(org) });
}

/**
 * Partner API: assign education to an employee. Author the curriculum with any
 * AI model you like and pass it inline:
 * { email, title, description?, dueAt?, note?,
 *   milestones?: [{ title, detail?, lessons: [{ title, objective?, kind?, content? }] }] }
 * Lessons with `content` are ready to read immediately; the rest can be
 * generated in-app by the employee's AI.
 */
export async function POST(request: Request) {
  const org = orgFromRequest(request);
  if (!org) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const result = buildAssignment(org, body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(
    { assignment: assignmentDetailJson(org, result.assignment.id) },
    { status: 201 },
  );
}
