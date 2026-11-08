import { test } from "node:test";
import assert from "node:assert/strict";

process.env.RESEND_API_KEY ||= "re_test_key";
const { sendTempPasswordEmail, sendWeeklyReportEmail, sendPasswordResetEmail } = await import("../lib/email.ts");

/** Capture what Resend would send by stubbing fetch. */
async function capture(fn: () => Promise<void>): Promise<{ subject: string; html: string; text: string }> {
  const orig = globalThis.fetch;
  let sent: { subject: string; html: string; text: string } | null = null;
  globalThis.fetch = (async (_u: unknown, init?: { body?: unknown }) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "email_1" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = orig;
  }
  assert.ok(sent, "an email was sent");
  return sent!;
}

const base = { to: "gisela@example.com", name: "Gisela Pérez", orgName: "American Iron", tempPassword: "Ab12Cd34", loginUrl: "https://x/login" };

test("a Spanish employee gets the welcome email in Spanish", async () => {
  const m = await capture(() => sendTempPasswordEmail({ ...base, lang: "es" }));
  assert.match(m.subject, /te agregó a Abrany/);
  assert.match(m.html, /Contraseña temporal/);
  assert.match(m.html, /<html lang="es">/);
  assert.match(m.text, /Contraseña temporal: Ab12Cd34/);
  assert.doesNotMatch(m.html, /Temporary password|Log in &/);
});

test("English stays English (and unknown languages fall back to it)", async () => {
  const en = await capture(() => sendTempPasswordEmail({ ...base }));
  assert.equal(en.subject, "American Iron added you to Abrany — your temporary password");
  const fr = await capture(() => sendTempPasswordEmail({ ...base, lang: "fr" }));
  assert.equal(fr.subject, en.subject);
});

test("weekly report and password reset follow the recipient's language", async () => {
  const w = await capture(() =>
    sendWeeklyReportEmail({ to: "g@x.com", name: "Gisela", focusMin: 50, sessionCount: 1, sectionsCompleted: 2, certificatesEarned: 0, appUrl: "https://x", lang: "es" }),
  );
  assert.match(w.subject, /Tu semana en Abrany/);
  assert.match(w.html, /1 sesión de enfoque registrada/);
  const r = await capture(() => sendPasswordResetEmail({ to: "g@x.com", name: "Gisela", orgName: "", resetUrl: "https://x/reset", tokenId: 9, lang: "es" }));
  assert.equal(r.subject, "Restablece tu contraseña de Abrany");
});
