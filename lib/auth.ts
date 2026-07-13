import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createUser, getUser, getUserByEmail, backfillOwnerData, type User } from "./repo";

/**
 * Minimal, dependency-free auth: scrypt password hashing + an HMAC-signed
 * session cookie (stateless). The owner account is seeded from env
 * (ADMIN_EMAIL/ADMIN_PASSWORD) and uses the server's built-in AI keys; everyone
 * else signs up and brings their own key.
 */

const COOKIE = "abrany_session";
const ACT_COOKIE = "abrany_act_as"; // owner-only: id of the user being impersonated
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const secret = () => process.env.SESSION_SECRET ?? "insecure-dev-secret";

/* ── passwords ─────────────────────────────────────────────── */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const h = scryptSync(pw, salt, 64);
  const known = Buffer.from(hash, "hex");
  return h.length === known.length && timingSafeEqual(h, known);
}

/* ── session token (HMAC-signed) ───────────────────────────── */
function sign(userId: number): string {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verify(token: string | undefined): number | null {
  if (!token) return null;
  const [userId, exp, sig] = token.split(".");
  if (!userId || !exp || !sig) return null;
  const expected = createHmac("sha256", secret()).update(`${userId}.${exp}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Date.now() > Number(exp)) return null;
  return Number(userId);
}

/* ── owner seeding (idempotent) ────────────────────────────── */
let ownerEnsured = false;
export function ensureOwner(): void {
  if (ownerEnsured) return;
  ownerEnsured = true;
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const owner = getUserByEmail(email) ?? createUser(email, hashPassword(password), true);
  // one-time: adopt any pre-multi-tenant rows (NULL user_id) so they belong to the owner
  backfillOwnerData(owner.id);
}

/* ── cookie helpers (call inside route handlers) ───────────── */
const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};

export async function startSession(userId: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, sign(userId), cookieOpts);
  jar.delete(ACT_COOKIE); // a fresh login never carries a stale impersonation
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(ACT_COOKIE);
}

/**
 * Resolve the request's real user, and the "effective" user it's acting as.
 * Impersonation is honored ONLY when the real signed-in user is the owner, so a
 * forged act-as cookie is worthless without the owner's session.
 */
export async function getAuthState(): Promise<{
  real: User | null;
  effective: User | null;
  impersonating: boolean;
}> {
  const jar = await cookies();
  const realId = verify(jar.get(COOKIE)?.value);
  const real = realId == null ? null : getUser(realId) ?? null;
  if (!real) return { real: null, effective: null, impersonating: false };
  if (real.is_owner) {
    const actId = verify(jar.get(ACT_COOKIE)?.value);
    if (actId != null && actId !== real.id) {
      const target = getUser(actId);
      if (target) return { real, effective: target, impersonating: true };
    }
  }
  return { real, effective: real, impersonating: false };
}

/** Current EFFECTIVE user (the impersonated user when the owner is acting as one). */
export async function getSessionUser(): Promise<User | null> {
  return (await getAuthState()).effective;
}

/** Owner-only: begin acting as another user. */
export async function startImpersonation(userId: number): Promise<void> {
  const jar = await cookies();
  jar.set(ACT_COOKIE, sign(userId), cookieOpts);
}

/** Stop acting as another user. */
export async function stopImpersonation(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACT_COOKIE);
}

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
export const forbidden = () => NextResponse.json({ error: "Not found" }, { status: 404 });
