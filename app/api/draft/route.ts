import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { llmContext, withLlm } from "@/lib/minimax";
import { learnerProfile } from "@/lib/memory";
import { runDraftTurn, type DraftTurn } from "@/lib/draftAssistant";
import { getSurface } from "@/lib/draftSurfaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The shared "Draft with AI" co-pilot. Every create form POSTs here to run one
 * turn of a short SMART conversation that ends by drafting the form's fields.
 * Best-effort: it never 500s the form — the user can always ignore it and type.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const surfaceId = (body.surface ?? "").toString();
  const surface = getSurface(surfaceId);
  if (!surface) return NextResponse.json({ error: "Unknown surface" }, { status: 400 });

  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });

  const messages: DraftTurn[] = Array.isArray(body.messages)
    ? body.messages
        .filter((m: unknown): m is DraftTurn => {
          const t = m as DraftTurn;
          return !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string";
        })
        .slice(-12)
    : [];

  // The user answered this many questions already; force a draft after 3.
  const answered = messages.filter((m) => m.role === "user").length;
  const mustDraft = body.mustDraft === true || answered >= 4;

  // Enrich context: personal profile for self surfaces, caller/subject for team/employee.
  let context = (body.context ?? "").toString().slice(0, 2000);
  if (surface.audience === "self") {
    try {
      const { digest } = learnerProfile(user.id);
      if (digest) context += `\n\nAbout this user (personalize, don't ask what you can infer):\n${digest}`;
    } catch {
      /* profile is best-effort */
    }
  } else {
    context =
      `You are helping an org ${user.is_owner ? "owner" : "admin"} create this for their people. ` +
      context;
  }

  try {
    const result = await withLlm(
      llm.creds,
      () => runDraftTurn({ surfaceId, messages, context, mustDraft }),
      user.language,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The assistant is unavailable — you can fill the form by hand." },
      { status: 502 },
    );
  }
}
