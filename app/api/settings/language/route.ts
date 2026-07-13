import { NextResponse } from "next/server";
import { setUserLanguage } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { isSupported } from "@/lib/languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Set the current user's content language. Body: { language: code }. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const language = (body.language ?? "").toString();
  if (!isSupported(language)) return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  setUserLanguage(user.id, language);
  return NextResponse.json({ ok: true, language });
}
