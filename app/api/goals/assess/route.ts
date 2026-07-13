import { NextResponse } from "next/server";
import { assessScope } from "@/lib/coach";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { llmContext, withLlm } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const title = (body.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  try {
    const verdict = await withLlm(
      llm.creds,
      () => assessScope({ title, description: (body.description ?? "").toString() }),
      user.language,
    );
    return NextResponse.json({ verdict });
  } catch {
    // fail open: if the coach is unavailable, treat as feasible so creation isn't blocked
    return NextResponse.json({ verdict: { feasible: true } });
  }
}
