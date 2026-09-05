import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureWorker } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness/readiness probe — verifies the process + DB are up. */
export async function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    ensureWorker(); // the host's health probe doubles as the worker's wake-up after a restart
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
