import { NextResponse } from "next/server";
import { hasServerVoice, synthesizeSpeech } from "@/lib/tts";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the client whether a server voice is configured (else use free browser TTS). */
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  return NextResponse.json({ server: hasServerVoice() });
}

/** Synthesize speech with the configured provider; falls back to browser on the client. */
export async function POST(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const text = (body.text ?? "").toString().trim();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const result = await synthesizeSpeech(text);
  if (!result) return NextResponse.json({ fallback: "browser" }, { status: 200 });

  return new Response(new Uint8Array(result.audio), {
    headers: { "Content-Type": result.mime, "Cache-Control": "no-store" },
  });
}
