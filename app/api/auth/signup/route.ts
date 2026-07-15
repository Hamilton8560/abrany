import { NextResponse } from "next/server";
import { getUserByEmail, createUser } from "@/lib/repo";
import { hashPassword, startSession, ensureOwner, getSessionUser } from "@/lib/auth";
import { publicUser } from "@/lib/user";
import { acceptInvitesForUser } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  ensureOwner();
  const body = await request.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  if (getUserByEmail(email))
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });

  const user = createUser(email, hashPassword(password), false);
  acceptInvitesForUser(user); // employer invited this email → they join the org now
  await startSession(user.id);
  return NextResponse.json({ user: publicUser(user) }, { status: 201 });
}

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user: user ? publicUser(user) : null });
}
