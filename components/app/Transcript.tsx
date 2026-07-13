import { BrainGlyph } from "@/components/icons";
import type { CertData } from "./Certificate";

export type TranscriptRow = { title: string; kind: string; completed_at: string | null; grade: string };

const KIND: Record<string, string> = {
  read: "Reading", teach: "Lecture", practice: "Practice", apply: "Apply", check: "Self-check", review: "Review",
};
const kindLabel = (k: string) => KIND[k] ?? "Lesson";
const shortDate = (iso: string | null) =>
  iso ? new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z")).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
const completionPct = (c: CertData) => (c.sectionsTotal ? Math.round((c.sectionsDone / c.sectionsTotal) * 100) : 0);
const timeLabel = (min: number) => (min >= 60 ? `${(min / 60).toFixed(1)}h` : `${min}m`);

function GradePill({ grade, done }: { grade: string; done: boolean }) {
  if (!done) return <span className="rounded-full bg-ink/6 px-2.5 py-1 text-[11.5px] font-semibold text-muted">Pending</span>;
  if (!grade) return <span className="rounded-full bg-up/15 px-2.5 py-1 text-[11.5px] font-semibold text-up">Completed</span>;
  const tone = /^[A-F]/.test(grade)
    ? "bg-up/15 text-[#1f8043]"
    : grade.includes("%")
      ? "bg-accent/12 text-accent"
      : "bg-ink/6 text-ink";
  return <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone}`}>{grade}</span>;
}

/** On-brand curriculum transcript — the graded record of everything done. */
export default function Transcript({ c, rows }: { c: CertData; rows: TranscriptRow[] }) {
  const issued = new Date(c.issuedAt.replace(" ", "T") + (c.issuedAt.includes("Z") ? "" : "Z")).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  return (
    <div className="relative mx-auto w-full max-w-[860px] overflow-hidden rounded-[24px] border border-line bg-[#fcfdfe] text-ink shadow-[var(--shadow-card)]">
      <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg,#ff4326,#ff8a3d)" }} />
      <img src="/brain.png" alt="" aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 w-[360px] mix-blend-multiply" style={{ opacity: 0.09 }} />

      <div className="relative flex flex-col gap-6 p-8 sm:p-10">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-11 place-items-center rounded-full bg-ink text-white">
              <BrainGlyph className="size-6" />
            </span>
            <span className="font-display text-[20px] font-extrabold tracking-[2px]">ABRANY</span>
          </div>
          <span className="rounded-full border border-line px-3 py-1.5 text-[10.5px] font-bold tracking-[1.8px] text-muted">
            OFFICIAL RECORD
          </span>
        </div>

        {/* title */}
        <div>
          <p className="font-display text-[12.5px] font-bold tracking-[3px] text-accent">CURRICULUM TRANSCRIPT</p>
          <h1 className="mt-1.5 font-display text-[clamp(26px,4vw,34px)] font-extrabold leading-[1.02]">{c.title}</h1>
          <p className="mt-1.5 text-[14px] text-muted">Issued to {c.recipientName} · Completed {issued}</p>
        </div>

        {/* summary tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [c.overall, "OVERALL", true],
            [`${completionPct(c)}%`, "COMPLETION", false],
            [timeLabel(c.minutesTotal), "TIME INVESTED", false],
            [`${c.sectionsTotal}`, "SECTIONS", false],
          ].map(([v, l, accent], i) => (
            <div key={i} className="rounded-[16px] border border-line bg-white p-4">
              <p className={`font-display text-[22px] font-extrabold ${accent ? "text-accent" : "text-ink"}`}>{v as string}</p>
              <p className="mt-0.5 text-[11px] font-medium tracking-[0.8px] text-muted">{l as string}</p>
            </div>
          ))}
        </div>

        {/* table */}
        <div className="overflow-hidden rounded-[16px] border border-line">
          <div className="grid grid-cols-[1fr_100px_96px_90px] bg-[#f1f5fa] px-5 py-3 text-[10.5px] font-medium tracking-[1px] text-muted">
            <span>SECTION</span><span>TYPE</span><span>GRADE</span><span className="text-right">DONE</span>
          </div>
          {rows.length === 0 && <p className="px-5 py-6 text-center text-[13px] text-muted">No sections recorded.</p>}
          {rows.map((r, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_100px_96px_90px] items-center px-5 py-3 ${i % 2 ? "bg-[#fafcfe]" : "bg-white"} ${i < rows.length - 1 ? "border-b border-line" : ""}`}
            >
              <span className="truncate pr-3 text-[13.5px] font-semibold text-ink">{r.title}</span>
              <span className="text-[12.5px] text-muted">{kindLabel(r.kind)}</span>
              <span><GradePill grade={r.grade} done={!!r.completed_at} /></span>
              <span className="text-right text-[12.5px] text-muted">{shortDate(r.completed_at)}</span>
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#ff4326,#ff8a3d)" }}>
              <BrainGlyph className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink">Verified by Abrany</p>
              <p className="text-[11.5px] text-muted">Official record of completion</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9.5px] font-medium tracking-[1.5px] text-muted">CREDENTIAL ID</p>
            <p className="text-[13px] font-semibold tracking-[0.3px] text-ink">{c.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
