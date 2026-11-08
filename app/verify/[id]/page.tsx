import Link from "next/link";
import { headers } from "next/headers";
import { getCertificate, goalStats, examsForGoal } from "@/lib/repo";
import { qrDataUrl } from "@/lib/qr";
import Certificate, { type CertData } from "@/components/app/Certificate";
import Transcript from "@/components/app/Transcript";
import { CheckIcon } from "@/components/icons";
import { getUiLocale } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";

/** Render a translated sentence, swapping its {placeholders} for JSX so word order follows the language. */
function rich(s: string, parts: Record<string, React.ReactNode>): React.ReactNode[] {
  return s.split(/\{(\w+)\}/).map((seg, i) => (i % 2 ? <span key={i}>{parts[seg] ?? `{${seg}}`}</span> : seg));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public credential verification — anyone with the ID can confirm the achievement. */
export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cert = getCertificate(id);
  const locale = await getUiLocale();
  const t = makeT(locale);

  if (!cert) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 py-16">
        <div className="glass w-full max-w-[440px] rounded-[var(--radius-card-lg)] p-8 text-center">
          <h1 className="font-display text-[24px] font-extrabold uppercase text-ink">{t("Credential not found")}</h1>
          <p className="mt-2 text-[14px] text-muted">
            {rich(t("No Abrany credential matches {id}. Check the ID and try again."), { id: <span className="font-semibold text-ink">{id}</span> })}
          </p>
          <Link href="/" className="mt-5 inline-block text-[13px] font-semibold text-accent">{t("← Back to Abrany")}</Link>
        </div>
      </main>
    );
  }

  const h = await headers();
  const base = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const rows = cert.goal_id ? goalStats(cert.goal_id).rows : [];
  const exams = cert.goal_id ? examsForGoal(cert.goal_id) : [];
  const verifyUrl = `${base}/verify/${cert.id}`;
  const c: CertData = {
    id: cert.id,
    recipientName: cert.recipient_name,
    title: cert.title,
    sectionsTotal: cert.sections_total,
    sectionsDone: cert.sections_done,
    minutesTotal: cert.minutes_total,
    overall: cert.overall,
    issuedAt: cert.issued_at,
    verifyUrl,
    qr: await qrDataUrl(verifyUrl),
    orgName: cert.org_name,
    orgLogo: cert.org_logo,
  };

  return (
    <main className="mx-auto flex max-w-[1040px] flex-col gap-8 px-5 py-10 sm:px-8">
      <div className="glass flex flex-col items-center gap-3 rounded-[var(--radius-card-lg)] p-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-up/15 text-up">
          <CheckIcon className="size-6" />
        </span>
        <div>
          <p className="font-display text-[18px] font-extrabold uppercase text-ink">{t("Verified credential")}</p>
          <p className="mt-1 text-[14px] text-muted">
            {rich(
              cert.org_name
                ? t("{name} completed {title} under {org} on Abrany. Credential {id}.")
                : t("{name} completed {title} on Abrany. Credential {id}."),
              {
                name: <span className="font-semibold text-ink">{cert.recipient_name}</span>,
                title: <span className="font-semibold text-ink">{cert.title}</span>,
                org: <span className="font-semibold text-ink">{cert.org_name}</span>,
                id: <span className="font-semibold text-ink">{cert.id}</span>,
              },
            )}
          </p>
        </div>
      </div>

      <Certificate c={c} locale={locale} />
      <Transcript c={c} rows={rows} exams={exams} locale={locale} />

      <p className="text-center text-[12.5px] text-muted">
        <Link href="/" className="font-semibold text-accent">Abrany</Link> {t("— the first personal brain trainer.")}
      </p>
    </main>
  );
}
