import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getCertificate, goalStats, examsForGoal } from "@/lib/repo";
import { qrDataUrl } from "@/lib/qr";
import Certificate, { type CertData } from "@/components/app/Certificate";
import Transcript from "@/components/app/Transcript";
import CredentialActions from "@/components/app/CredentialActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CredentialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) notFound();
  const cert = getCertificate(id);
  if (!cert) notFound();
  if (cert.user_id !== user.id && !user.is_owner) notFound();

  const h = await headers();
  const base = `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const verifyUrl = `${base}/verify/${cert.id}`;
  const rows = cert.goal_id ? goalStats(cert.goal_id).rows : [];
  const exams = cert.goal_id ? examsForGoal(cert.goal_id) : [];
  const qr = await qrDataUrl(verifyUrl);

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
    qr,
    orgName: cert.org_name,
    orgLogo: cert.org_logo,
  };

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/app/goals" className="text-[13px] font-medium text-muted hover:text-ink">
          ← Back to goals
        </Link>
        <CredentialActions
          verifyUrl={verifyUrl}
          linkedin={{
            name: `${cert.title} — Abrany`,
            issueYear: new Date(cert.issued_at.replace(" ", "T") + "Z").getUTCFullYear(),
            issueMonth: new Date(cert.issued_at.replace(" ", "T") + "Z").getUTCMonth() + 1,
            certId: cert.id,
          }}
        />
      </div>

      <section className="flex flex-col gap-8">
        <Certificate c={c} />
        <Transcript c={c} rows={rows} exams={exams} />
      </section>

      <p className="text-center text-[12.5px] text-muted print:hidden">
        Anyone can confirm this credential at{" "}
        <span className="font-medium text-ink">{verifyUrl.replace(/^https?:\/\//, "")}</span>
      </p>
    </div>
  );
}
