import { Resend } from "resend";
import { toUiLocale } from "./i18n/locale";

/**
 * Transactional email (Resend, summit-labs.io). Every send is best-effort: a
 * failure is logged and swallowed, never thrown — email must never break the
 * primary flow (signing someone up, issuing a certificate, etc).
 *
 * Every email goes out in the RECIPIENT's account language (`lang`): Spanish
 * when it is "es", English otherwise (no other email translations yet).
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

type L = "en" | "es";
const pick = (lang: string | null | undefined): L => (toUiLocale(lang) === "es" ? "es" : "en");
const first = (name: string) => name.split(" ")[0];

const wrap = (bodyHtml: string, preheader: string, lang: L = "en") => `<!doctype html>
<html lang="${lang}">
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
<p style="margin:20px 0 0;color:#8891a0;font-size:12px;">${lang === "es" ? "Abrany — tu primer entrenador cerebral personal." : "Abrany — the first personal brain trainer."}</p>
</td></tr>
</table>
</body>
</html>`;

const button = (href: string, label: string) =>
  `<div style="margin:22px 0;"><a href="${href}" style="display:inline-block;background:#1b2436;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px;">${label}</a></div>`;

const eyebrow = (label: string) =>
  `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:2px;color:#ff4326;text-transform:uppercase;">${label}</p>`;

const label = (text: string) =>
  `<p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;color:#8891a0;text-transform:uppercase;">${text}</p>`;

/* ── team signup: temp password, must reset on first login ────── */

export async function sendTempPasswordEmail(opts: {
  to: string;
  name: string;
  orgName: string;
  tempPassword: string;
  loginUrl: string;
  lang?: string;
}) {
  const l = pick(opts.lang);
  const c =
    l === "es"
      ? {
          eyebrow: `Ya eres parte del equipo de ${opts.orgName}`,
          h1: "Te damos la bienvenida a Abrany",
          intro: `${opts.orgName} te inscribió para capacitarte en Abrany. Aquí tienes una contraseña temporal para entrar; vas a crear la tuya en cuanto inicies sesión.`,
          email: "Correo",
          temp: "Contraseña temporal",
          cta: "Iniciar sesión y crear mi contraseña",
          note: "Esta contraseña solo funciona una vez: te pediremos que elijas la tuya en cuanto inicies sesión.",
          pre: `Tu contraseña temporal de Abrany, de parte de ${opts.orgName}`,
          text: `${opts.orgName} te inscribió para capacitarte en Abrany.\n\nCorreo: ${opts.to}\nContraseña temporal: ${opts.tempPassword}\n\nInicia sesión y crea tu propia contraseña: ${opts.loginUrl}\n\nEsta contraseña solo funciona una vez.`,
          subject: `${opts.orgName} te agregó a Abrany: tu contraseña temporal`,
        }
      : {
          eyebrow: `You're on ${opts.orgName}'s team`,
          h1: "Welcome to Abrany",
          intro: `${opts.orgName} signed you up for training on Abrany. Here's a temporary password to get in — you'll set your own right after logging in.`,
          email: "Email",
          temp: "Temporary password",
          cta: "Log in & set your password",
          note: "This password only works once — you'll be asked to choose your own the moment you log in.",
          pre: `Your temporary Abrany password from ${opts.orgName}`,
          text: `${opts.orgName} signed you up for training on Abrany.\n\nEmail: ${opts.to}\nTemporary password: ${opts.tempPassword}\n\nLog in and set your own password: ${opts.loginUrl}\n\nThis password only works once.`,
          subject: `${opts.orgName} added you to Abrany — your temporary password`,
        };
  const html = wrap(
    `${eyebrow(c.eyebrow)}
     <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;">${c.h1}</h1>
     <p style="margin:0 0 18px;color:#5c6675;">${c.intro}</p>
     <div style="background:#f2f5f9;border-radius:14px;padding:16px 20px;margin:0 0 4px;">
       ${label(c.email)}
       <p style="margin:0 0 12px;font-size:15px;font-weight:600;">${opts.to}</p>
       ${label(c.temp)}
       <p style="margin:0;font-size:18px;font-weight:700;font-family:ui-monospace,Menlo,monospace;letter-spacing:1px;">${opts.tempPassword}</p>
     </div>
     ${button(opts.loginUrl, c.cta)}
     <p style="margin:0;color:#8891a0;font-size:12.5px;">${c.note}</p>`,
    c.pre,
    l,
  );
  await send({ to: opts.to, subject: c.subject, html, text: c.text, idempotencyKey: `temp-password/${opts.to}` });
}

/** Existing account added to an org — no password to send, just a heads-up. */
export async function sendOrgAddedEmail(opts: { to: string; name: string; orgName: string; appUrl: string; lang?: string }) {
  const l = pick(opts.lang);
  const c =
    l === "es"
      ? {
          eyebrow: "Novedades del equipo",
          h1: `Hola, ${first(opts.name)}: ya eres parte del equipo de ${opts.orgName}`,
          body: `${opts.orgName} agregó tu cuenta de Abrany a su equipo. Las capacitaciones que te asignen, con sus fechas límite, van a aparecer en "Asignado a ti", en la página de tu empresa.`,
          cta: "Abrir Abrany",
          pre: `${opts.orgName} agregó tu cuenta de Abrany a su equipo`,
          text: `${opts.orgName} agregó tu cuenta de Abrany a su equipo.\n\nAbrir Abrany: ${opts.appUrl}`,
          subject: `${opts.orgName} te agregó a su equipo en Abrany`,
        }
      : {
          eyebrow: "Team update",
          h1: `Hey ${first(opts.name)}, you're on ${opts.orgName}'s team`,
          body: `${opts.orgName} added your existing Abrany account to their team. Any education they assign you — with deadlines — will show up under "Assigned to you" on your Company page.`,
          cta: "Open Abrany",
          pre: `${opts.orgName} added your Abrany account to their team`,
          text: `${opts.orgName} added your existing Abrany account to their team.\n\nOpen Abrany: ${opts.appUrl}`,
          subject: `${opts.orgName} added you to their team on Abrany`,
        };
  const html = wrap(
    `${eyebrow(c.eyebrow)}
     <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;">${c.h1}</h1>
     <p style="margin:0 0 4px;color:#5c6675;">${c.body}</p>
     ${button(opts.appUrl, c.cta)}`,
    c.pre,
    l,
  );
  await send({ to: opts.to, subject: c.subject, html, text: c.text, idempotencyKey: `org-added/${opts.to}/${opts.orgName}` });
}

/* ── password reset link (admin rescue + forgot-password) ─────── */

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  orgName: string;
  resetUrl: string;
  tokenId: number;
  lang?: string;
}) {
  const l = pick(opts.lang);
  const c =
    l === "es"
      ? {
          from: opts.orgName ? `${opts.orgName} usa Abrany para capacitar a su equipo.` : "Tú (o alguien más) pidió restablecer tu contraseña de Abrany.",
          eyebrow: "Restablecer contraseña",
          h1: `Crea una contraseña nueva, ${first(opts.name)}`,
          use: "Usa el botón de abajo para elegir una contraseña nueva y volver a entrar enseguida.",
          cta: "Crear mi contraseña",
          note: "Este enlace funciona una sola vez y vence en 7 días. Si no lo pediste, puedes ignorar este correo: tu contraseña no cambia.",
          pre: "Crea una contraseña nueva para Abrany",
          textLink: "Crea una contraseña nueva (el enlace funciona una vez y vence en 7 días):",
          textIgnore: "Si no lo pediste, ignora este correo.",
          subject: opts.orgName ? `${opts.orgName}: crea tu contraseña de Abrany` : "Restablece tu contraseña de Abrany",
        }
      : {
          from: opts.orgName ? `${opts.orgName} uses Abrany for training.` : "You (or someone) asked to reset your Abrany password.",
          eyebrow: "Password reset",
          h1: `Set a new password, ${first(opts.name)}`,
          use: "Use the button below to choose a new password and get straight back in.",
          cta: "Set my password",
          note: "This link works once and expires in 7 days. If you didn't ask for it, you can ignore this email — your password stays the same.",
          pre: "Set a new Abrany password",
          textLink: "Set a new password (link works once, expires in 7 days):",
          textIgnore: "If you didn't ask for this, ignore this email.",
          subject: opts.orgName ? `${opts.orgName} — set your Abrany password` : "Reset your Abrany password",
        };
  const html = wrap(
    `${eyebrow(c.eyebrow)}
     <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;">${c.h1}</h1>
     <p style="margin:0 0 6px;color:#5c6675;">${c.from} ${c.use}</p>
     ${button(opts.resetUrl, c.cta)}
     <p style="margin:0;color:#8891a0;font-size:12.5px;">${c.note}</p>`,
    c.pre,
    l,
  );
  const text = `${c.from}\n\n${c.textLink}\n${opts.resetUrl}\n\n${c.textIgnore}`;
  await send({
    to: opts.to,
    subject: c.subject,
    html,
    text,
    // unique per issuance so a re-send ALWAYS delivers (unlike the one-shot welcome email)
    idempotencyKey: `password-reset/${opts.tokenId}`,
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
  lang?: string;
}) {
  const l = pick(opts.lang);
  const strong = (s: string) => `<strong style="color:#1b2436;">${s}</strong>`;
  const c =
    l === "es"
      ? {
          eyebrow: "Certificado obtenido",
          h1: `🎓 ¡Lo lograste, ${first(opts.name)}!`,
          body: `Completaste ${strong(opts.title)} y obtuviste un certificado verificable, con una calificación general de ${strong(opts.overall)}.`,
          cta: "Ver tu certificado",
          note: `Credencial ${opts.certId} · cualquiera puede verificarla en el enlace de arriba.`,
          pre: `Obtuviste un certificado de ${opts.title}`,
          text: `Completaste ${opts.title} y obtuviste un certificado, con una calificación general de ${opts.overall}.\n\nCredencial ${opts.certId}\nVerlo: ${opts.verifyUrl}`,
          subject: `🎓 Certificado obtenido: ${opts.title}`,
        }
      : {
          eyebrow: "Certificate earned",
          h1: `🎓 You did it, ${first(opts.name)}`,
          body: `You completed ${strong(opts.title)} and earned a verifiable certificate — overall grade ${strong(opts.overall)}.`,
          cta: "View your certificate",
          note: `Credential ${opts.certId} · anyone can verify it at the link above.`,
          pre: `You earned a certificate for ${opts.title}`,
          text: `You completed ${opts.title} and earned a certificate — overall grade ${opts.overall}.\n\nCredential ${opts.certId}\nView it: ${opts.verifyUrl}`,
          subject: `🎓 Certificate earned — ${opts.title}`,
        };
  const html = wrap(
    `${eyebrow(c.eyebrow)}
     <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;">${c.h1}</h1>
     <p style="margin:0 0 18px;color:#5c6675;">${c.body}</p>
     ${button(opts.verifyUrl, c.cta)}
     <p style="margin:0;color:#8891a0;font-size:12.5px;">${c.note}</p>`,
    c.pre,
    l,
  );
  await send({ to: opts.to, subject: c.subject, html, text: c.text, idempotencyKey: `certificate/${opts.certId}` });
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
  lang?: string;
}) {
  const l = pick(opts.lang);
  const stat = (n: number | string, label: string) =>
    `<td align="center" style="padding:0 10px;"><p style="margin:0;font-size:22px;font-weight:800;color:#1b2436;">${n}</p><p style="margin:2px 0 0;font-size:10.5px;color:#8891a0;text-transform:uppercase;letter-spacing:.5px;">${label}</p></td>`;
  const quiet = opts.sessionCount === 0 && opts.sectionsCompleted === 0;
  const name = first(opts.name);
  const n = opts.sessionCount;
  const c =
    l === "es"
      ? {
          eyebrow: "Tu semana en Abrany",
          h1: quiet ? `Una semana tranquila, ${name}` : `¡Buen trabajo esta semana, ${name}!`,
          focus: "Min. de enfoque",
          sections: "Secciones",
          certs: "Certificados",
          line: quiet
            ? "No registraste sesiones de enfoque esta semana. Con solo 15 minutos mantienes viva tu racha."
            : `${n} ${n === 1 ? "sesión de enfoque registrada" : "sesiones de enfoque registradas"}. ¡Sigue así!`,
          cta: "Seguir entrenando",
          off: "Puedes desactivar este correo cuando quieras en Configuración → Notificaciones por correo.",
          pre: `Tu semana en Abrany: ${opts.focusMin} minutos de enfoque, ${opts.sectionsCompleted} secciones`,
          text: `Tu semana en Abrany:\n\nMinutos de enfoque: ${opts.focusMin}\nSecciones completadas: ${opts.sectionsCompleted}\nCertificados obtenidos: ${opts.certificatesEarned}\n\nSigue entrenando: ${opts.appUrl}\n\nDesactiva este correo en Configuración → Notificaciones por correo.`,
          subject: quiet ? "Tu semana en Abrany: ¿retomamos?" : `Tu semana en Abrany: ${opts.focusMin} minutos de enfoque`,
        }
      : {
          eyebrow: "Your week on Abrany",
          h1: quiet ? `A quiet week, ${name}` : `Nice work this week, ${name}`,
          focus: "Focus min",
          sections: "Sections",
          certs: "Certificates",
          line: quiet
            ? "No focus sessions logged this week — even 15 minutes keeps the streak alive."
            : `${n} focus session${n === 1 ? "" : "s"} logged. Keep it going.`,
          cta: "Continue training",
          off: "Turn this off anytime in Settings → Email notifications.",
          pre: `Your Abrany week: ${opts.focusMin} focus minutes, ${opts.sectionsCompleted} sections`,
          text: `Your week on Abrany:\n\nFocus minutes: ${opts.focusMin}\nSections completed: ${opts.sectionsCompleted}\nCertificates earned: ${opts.certificatesEarned}\n\nContinue training: ${opts.appUrl}\n\nTurn this off in Settings → Email notifications.`,
          subject: quiet ? "Your Abrany week — pick it back up?" : `Your Abrany week: ${opts.focusMin} focus minutes`,
        };
  const html = wrap(
    `${eyebrow(c.eyebrow)}
     <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;">${c.h1}</h1>
     <table role="presentation" width="100%" style="margin:0 0 18px;"><tr>
       ${stat(opts.focusMin, c.focus)}
       ${stat(opts.sectionsCompleted, c.sections)}
       ${stat(opts.certificatesEarned, c.certs)}
     </tr></table>
     <p style="margin:0 0 4px;color:#5c6675;">${c.line}</p>
     ${button(opts.appUrl, c.cta)}
     <p style="margin:12px 0 0;color:#8891a0;font-size:12px;">${c.off}</p>`,
    c.pre,
    l,
  );
  await send({
    to: opts.to,
    subject: c.subject,
    html,
    text: c.text,
    idempotencyKey: `weekly-report/${opts.to}/${new Date().toISOString().slice(0, 10)}`,
  });
}

/** Exposed for tests: render without sending. */
export const __emailTest = { pick };
