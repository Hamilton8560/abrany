import { NextResponse } from "next/server";
import { setUserAiCreds } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { PROVIDERS, withLlm, complete, type Provider, type LlmCreds } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save (and validate) the user's own AI provider + key. Owner uses built-in keys. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.is_owner)
    return NextResponse.json({ error: "The owner uses the built-in AI — no key needed." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const provider = (body.provider ?? "").toString() as Provider;
  const key = (body.key ?? "").toString().trim();
  const model = (body.model ?? "").toString().trim();
  if (!PROVIDERS.includes(provider))
    return NextResponse.json({ error: "Pick a valid provider" }, { status: 400 });
  if (!key) return NextResponse.json({ error: "Enter your API key" }, { status: 400 });
  if (provider === "openrouter" && !model)
    return NextResponse.json({ error: "OpenRouter needs a model id (e.g. deepseek/deepseek-chat)" }, { status: 400 });

  // validate the key with a tiny call before saving
  const creds: LlmCreds = { provider, key, model };
  try {
    await withLlm(creds, () =>
      complete({ system: "Reply with the single word OK.", messages: [{ role: "user", content: "OK" }], maxTokens: 8 }),
    );
  } catch {
    return NextResponse.json(
      { error: "That key didn't work — check the key, provider, and model." },
      { status: 400 },
    );
  }

  setUserAiCreds(user.id, provider, key, model);
  return NextResponse.json({ ok: true, provider, model });
}

/** Disconnect (clear) the user's AI key. */
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  setUserAiCreds(user.id, "", "", "");
  return NextResponse.json({ ok: true });
}
