import { Resend } from "resend";

/**
 * Transactional email (Resend, summit-labs.io). Every send is best-effort: a
 * failure is logged and swallowed, never thrown — email must never break the
 * primary flow (signing someone up, issuing a certificate, etc).
 */

const FROM = process.env.RESEND_FROM || "Abrany <notify@summit-labs.io>";
let client: Resend | null = null;
const resend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

async function send(opts: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${opts.subject}" to ${opts.to}`);
    return;
  }
  const { error } = await resend().emails.send(
    { from: FROM, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text },
    { idempotencyKey: opts.idempotencyKey },
  );
  if (error) console.error(`[email] failed "${opts.subject}" to ${opts.to}:`, error.message);
}

/* ── shared layout ──────────────────────────────────────────── */

const wrap = (bodyHtml: string, preheader: string) => `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#fcfdfe;border-radius:20px;overflow:hidden;border:1px solid #e3e8ef;">
<tr><td style="padding:28px 32px 0;">
  <div style="display:flex;align-items:center;gap:9px;">
    <span style="display:inline-block;width:24px;height:24px;border-radius:999px;background:#1b2436;text-align:center;line-height:24px;color:#fff;font-size:12px;font-weight:700;">A</span>
    <span style="font-weight:700;font-size:14px;letter-spacing:3px;color:#1b2436;">ABRANY</span>
  </div>
</td></tr>
<tr><td style="padding:20px 32px 32px;color:#1b2436;font-size:15px;line-height:1.6;">
${bodyHtml}
</td></tr>
</table>
<p style="margin:20px 0 0;color:#8891a0;font-size:12px;">Abrany — the first personal brain trainer.</p>
</td></tr>
</table>
</body>
</html>`;

const button = (href: string, label: string) =>
  `<div style="margin:22px 0;"><a href="${href}" style="display:inline-block;background:#1b2436;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px;">${label}</a></div>`;

const eyebrow = (label: string) =>
  `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:2px;color:#ff4326;text-transform:uppercase;">${label}</p>`;

/* ── team signup: temp password, must reset on first login ────── */

export async function sendTempPasswordEmail(opts: {
  to: string;
  name: string;
  orgName: string;
  tempPassword: string;
  loginUrl: string;
}) {
  const html = wrap(
    `${eyebrow(`You're on ${opts.orgName}'s team`)}
     <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;">Welcome to Abrany</h1>
     <p style="margin:0 0 18px;color:#5c6675;">${opts.orgName} signed you up for training on Abrany. Here's a temporary password to get in — you'll set your own right after logging in.</p>
     <div style="background:#f2f5f9;border-radius:14px;padding:16px 20px;margin:0 0 4px;">
       <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;color:#8891a0;text-transform:uppercase;">Email</p>
       <p style="margin:0 0 12px;font-size:15px;font-weight:600;">${opts.to}</p>
       <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;color:#8891a0;text-transform:uppercase;">Temporary password</p>
       <p style="margin:0;font-size:18px;font-weight:700;font-family:ui-monospace,Menlo,monospace;letter-spacing:1px;">${opts.tempPassword}</p>
     </div>
     ${button(opts.loginUrl, "Log in & set your password")}
     <p style="margin:0;color:#8891a0;font-size:12.5px;">This password only works once — you'll be asked to choose your own the moment you log in.</p>`,
    `Your temporary Abrany password from ${opts.orgName}`,
  );
  const text = `${opts.orgName} signed you up for training on Abrany.\n\nEmail: ${opts.to}\nTemporary password: ${opts.tempPassword}\n\nLog in and set your own password: ${opts.loginUrl}\n\nThis password only works once.`;
  await send({
    to: opts.to,
    subject: `${opts.orgName} added you to Abrany — your temporary password`,
    html,
    text,
    idempotencyKey: `temp-password/${opts.to}`,
  });
}

/** Existing account added to an org — no password to send, just a heads-up. */
export async function sendOrgAddedEmail(opts: { to: string; name: string; orgName: string; appUrl: string }) {
  const html = wrap(
    `${eyebrow("Team update")}
     <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;">Hey ${opts.name.split(" ")[0]}, you're on ${opts.orgName}'s team</h1>
     <p style="margin:0 0 4px;color:#5c6675;">${opts.orgName} added your existing Abrany account to their team. Any education they assign you — with deadlines — will show up under "Assigned to you" on your Company page.</p>
     ${button(opts.appUrl, "Open Abrany")}`,
    `${opts.orgName} added your Abrany account to their team`,
  );
  const text = `${opts.orgName} added your existing Abrany account to their team.\n\nOpen Abrany: ${opts.appUrl}`;
  await send({
    to: opts.to,
    subject: `${opts.orgName} added you to their team on Abrany`,
    html,
    text,
    idempotencyKey: `org-added/${opts.to}/${opts.orgName}`,
  });
}

/* ── certificate earned ────────────────────────────────────────── */

export async function sendCertificateEmail(opts: {
  to: string;
  name: string;
  title: string;
  overall: string;
  certId: string;
  verifyUrl: string;
}) {
  const html = wrap(
    `${eyebrow("Certificate earned")}
     <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;">🎓 You did it, ${opts.name.split(" ")[0]}</h1>
     <p style="margin:0 0 18px;color:#5c6675;">You completed <strong style="color:#1b2436;">${opts.title}</strong> and earned a verifiable certificate — overall grade <strong style="color:#1b2436;">${opts.overall}</strong>.</p>
     ${button(opts.verifyUrl, "View your certificate")}
     <p style="margin:0;color:#8891a0;font-size:12.5px;">Credential ${opts.certId} · anyone can verify it at the link above.</p>`,
    `You earned a certificate for ${opts.title}`,
  );
  const text = `You completed ${opts.title} and earned a certificate — overall grade ${opts.overall}.\n\nCredential ${opts.certId}\nView it: ${opts.verifyUrl}`;
  await send({
    to: opts.to,
    subject: `🎓 Certificate earned — ${opts.title}`,
    html,
    text,
    idempotencyKey: `certificate/${opts.certId}`,
  });
}

/* ── weekly progress report ───────────────────────────────────── */

export async function sendWeeklyReportEmail(opts: {
  to: string;
  name: string;
  focusMin: number;
  sessionCount: number;
  sectionsCompleted: number;
  certificatesEarned: number;
  appUrl: string;
}) {
  const stat = (n: number | string, label: string) =>
    `<td align="center" style="padding:0 10px;"><p style="margin:0;font-size:22px;font-weight:800;color:#1b2436;">${n}</p><p style="margin:2px 0 0;font-size:10.5px;color:#8891a0;text-transform:uppercase;letter-spacing:.5px;">${label}</p></td>`;
  const quiet = opts.sessionCount === 0 && opts.sectionsCompleted === 0;
  const html = wrap(
    `${eyebrow("Your week on Abrany")}
     <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;">${quiet ? `A quiet week, ${opts.name.split(" ")[0]}` : `Nice work this week, ${opts.name.split(" ")[0]}`}</h1>
     <table role="presentation" width="100%" style="margin:0 0 18px;"><tr>
       ${stat(opts.focusMin, "Focus min")}
       ${stat(opts.sectionsCompleted, "Sections")}
       ${stat(opts.certificatesEarned, "Certificates")}
     </tr></table>
     <p style="margin:0 0 4px;color:#5c6675;">${
       quiet
         ? "No focus sessions logged this week — even 15 minutes keeps the streak alive."
         : `${opts.sessionCount} focus session${opts.sessionCount === 1 ? "" : "s"} logged. Keep it going.`
     }</p>
     ${button(opts.appUrl, "Continue training")}
     <p style="margin:12px 0 0;color:#8891a0;font-size:12px;">Turn this off anytime in Settings → Email notifications.</p>`,
    `Your Abrany week: ${opts.focusMin} focus minutes, ${opts.sectionsCompleted} sections`,
  );
  const text = `Your week on Abrany:\n\nFocus minutes: ${opts.focusMin}\nSections completed: ${opts.sectionsCompleted}\nCertificates earned: ${opts.certificatesEarned}\n\nContinue training: ${opts.appUrl}\n\nTurn this off in Settings → Email notifications.`;
  await send({
    to: opts.to,
    subject: quiet ? "Your Abrany week — pick it back up?" : `Your Abrany week: ${opts.focusMin} focus minutes`,
    html,
    text,
    idempotencyKey: `weekly-report/${opts.to}/${new Date().toISOString().slice(0, 10)}`,
  });
}
