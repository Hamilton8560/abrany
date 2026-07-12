import { NextResponse } from "next/server";
import { assessScope } from "@/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = (body.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  try {
    const verdict = await assessScope({ title, description: (body.description ?? "").toString() });
    return NextResponse.json({ verdict });
  } catch {
    // fail open: if the coach is unavailable, treat as feasible so creation isn't blocked
    return NextResponse.json({ verdict: { feasible: true } });
  }
}
