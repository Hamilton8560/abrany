import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/repo";
import { verifyPassword, startSession, ensureOwner } from "@/lib/auth";
import { publicUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  ensureOwner(); // make sure the owner account exists before login
  const body = await request.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();

  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }
  await startSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
}
