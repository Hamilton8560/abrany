import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";

/**
 * Single-use password reset links. Used by the admin "Send reset link" rescue in the
 * Team tab and by the public "Forgot password?" flow. Only a sha256 of the token is
 * stored — the raw token exists solely in the email link. Issuing a new token
 * invalidates any older unused one, so exactly one link works at a time.
 */

export const RESET_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function createResetToken(userId: number): { token: string; id: number } {
  const db = getDb();
  db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(userId);
  const token = randomBytes(32).toString("base64url");
  const info = db
    .prepare("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
    .run(userId, hash(token), new Date(Date.now() + RESET_TTL_MS).toISOString());
  return { token, id: Number(info.lastInsertRowid) };
}

/** Atomically consume a token: the user id if it was valid, else null (unknown / expired / used). */
export function consumeResetToken(raw: string): number | null {
  if (!raw || raw.length > 200) return null;
  const db = getDb();
  const row = db
    .prepare("SELECT id, user_id, expires_at FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL")
    .get(hash(raw)) as { id: number; user_id: number; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  const claimed = db
    .prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL")
    .run(row.id);
  return Number(claimed.changes) > 0 ? row.user_id : null;
}
