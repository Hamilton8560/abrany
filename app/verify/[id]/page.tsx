import Link from "next/link";
import { headers } from "next/headers";
import { getCertificate, goalStats } from "@/lib/repo";
import Certificate, { type CertData } from "@/components/app/Certificate";
import Transcript from "@/components/app/Transcript";
import { CheckIcon } from "@/components/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public credential verification — anyone with the ID can confirm the achievement. */
export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cert = getCertificate(id);

  if (!cert) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 py-16">
        <div className="glass w-full max-w-[440px] rounded-[var(--radius-card-lg)] p-8 text-center">
          <h1 className="font-display text-[24px] font-extrabold uppercase text-ink">Credential not found</h1>
          <p className="mt-2 text-[14px] text-muted">
            No Abrany credential matches <span className="font-semibold text-ink">{id}</span>. Check the ID and try again.
          </p>
          <Link href="/" className="mt-5 inline-block text-[13px] font-semibold text-accent">← Back to Abrany</Link>
        </div>
      </main>
    );
  }

  const h = await headers();
  const base = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const rows = cert.goal_id ? goalStats(cert.goal_id).rows : [];
  const c: CertData = {
    id: cert.id,
    recipientName: cert.recipient_name,
    title: cert.title,
    sectionsTotal: cert.sections_total,
    sectionsDone: cert.sections_done,
    minutesTotal: cert.minutes_total,
    overall: cert.overall,
    issuedAt: cert.issued_at,
    verifyUrl: `${base}/verify/${cert.id}`,
  };

  return (
    <main className="mx-auto flex max-w-[1040px] flex-col gap-8 px-5 py-10 sm:px-8">
      <div className="glass flex flex-col items-center gap-3 rounded-[var(--radius-card-lg)] p-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-up/15 text-up">
          <CheckIcon className="size-6" />
        </span>
        <div>
          <p className="font-display text-[18px] font-extrabold uppercase text-ink">Verified credential</p>
          <p className="mt-1 text-[14px] text-muted">
            <span className="font-semibold text-ink">{cert.recipient_name}</span> completed{" "}
            <span className="font-semibold text-ink">{cert.title}</span> on Abrany. Credential{" "}
            <span className="font-semibold text-ink">{cert.id}</span>.
          </p>
        </div>
      </div>

      <Certificate c={c} />
      <Transcript c={c} rows={rows} />

      <p className="text-center text-[12.5px] text-muted">
        <Link href="/" className="font-semibold text-accent">Abrany</Link> — the first personal brain trainer.
      </p>
    </main>
  );
}
