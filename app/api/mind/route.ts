import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { mindGraph } from "@/lib/mind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The user's Open Knowledge Format corpus as a graph for the "Your Mind" view. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json(mindGraph(user.id));
}
