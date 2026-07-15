import { NextResponse } from "next/server";
import { addMemberByEmail } from "@/lib/org";
import { orgFromRequest, memberJson } from "@/lib/orgApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });

/** Partner API: list your organization's members. */
export async function GET(request: Request) {
  const org = orgFromRequest(request);
  if (!org) return unauthorized();
  return NextResponse.json({ members: memberJson(org) });
}

/** Partner API: sign an employee up (existing accounts join now, new emails get an invite). */
export async function POST(request: Request) {
  const org = orgFromRequest(request);
  if (!org) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const result = addMemberByEmail(org.id, email, body.role === "admin" ? "admin" : "member");
  return NextResponse.json({ ...result, members: memberJson(org) }, { status: 201 });
}
