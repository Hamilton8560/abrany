import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { llmContext } from "@/lib/minimax";
import { createManual, listManuals, type ManualRequest } from "@/lib/workshop";
import { enqueueManual } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The list view needs only the headline of each manual, not every step. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const manuals = listManuals(user.id).map(({ id, kind, title, status, error, created_at }) => ({
    id,
    kind,
    title,
    status,
    error,
    created_at,
  }));
  return NextResponse.json({ manuals });
}

/** Start a manual: { kind: build|repair, description, item?, location?, experience? }. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const description = (body.description ?? "").toString().trim().slice(0, 2000);
  if (description.length < 8)
    return NextResponse.json({ error: "Describe the job or the problem in a sentence or two" }, { status: 400 });
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });

  const req: ManualRequest = {
    description,
    item: (body.item ?? "").toString().trim().slice(0, 200),
    location: (body.location ?? "").toString().trim().slice(0, 120),
    experience: ["beginner", "handy", "pro"].includes(body.experience) ? body.experience : "handy",
  };
  const manual = createManual(user.id, body.kind === "build" ? "build" : "repair", req);
  enqueueManual(manual.id, user.id);
  return NextResponse.json({ manual: { id: manual.id } }, { status: 201 });
}
