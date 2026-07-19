import { NextResponse } from "next/server";
import { queueState } from "@/lib/queue";
import { jobBacklog } from "@/lib/repo";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  // queueState = the in-memory MiniMax concurrency gate; jobBacklog = the durable
  // background-generation queue (what "how many ahead of you" really means).
  const backlog = jobBacklog(user.id);
  return NextResponse.json({ ...queueState(), ...backlog });
}
