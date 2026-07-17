import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Password hashing, split out from lib/auth.ts so lib/org.ts (which needs to
 * hash temp passwords for new team members) doesn't create a circular import
 * with auth.ts (which imports createOrg/orgForUser from org.ts).
 */

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
