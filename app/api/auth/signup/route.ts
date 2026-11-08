import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserByEmail, createUser, setUserLanguage } from "@/lib/repo";
import { LOCALE_COOKIE, resolveUiLocale } from "@/lib/i18n/locale";
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
  // start a new account in the language they were browsing in (cookie, else browser)
  const lang = resolveUiLocale({
    cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  if (lang !== "en") {
    setUserLanguage(user.id, lang);
    user.language = lang;
  }
  acceptInvitesForUser(user); // employer invited this email → they join the org now
  await startSession(user.id);
  return NextResponse.json({ user: publicUser(user) }, { status: 201 });
}

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user: user ? publicUser(user) : null });
}
