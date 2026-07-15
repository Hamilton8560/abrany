import { NextResponse } from "next/server";
import { orgFromRequest, assignmentDetailJson } from "@/lib/orgApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Partner API: one assignment with per-section reading time, grades and exams. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const org = orgFromRequest(request);
  if (!org) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  const { id } = await params;
  const detail = assignmentDetailJson(org, Number(id));
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ assignment: detail });
}
