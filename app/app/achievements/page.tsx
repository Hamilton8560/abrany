import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listCertificates } from "@/lib/repo";
import { AwardIcon, ArrowRight } from "@/components/icons";
import { fmtDate as fmtUiDate, makeT } from "@/lib/i18n";
import { getUiLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fmtDate = (locale: string, iso: string) =>
  fmtUiDate(locale, new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z")), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
const timeLabel = (min: number) => (min >= 60 ? `${(min / 60).toFixed(1)}h` : `${min}m`);

export default async function AchievementsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const certs = listCertificates(user.id);
  const locale = await getUiLocale();
  const t = makeT(locale);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-7">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            {t("ACHIEVEMENTS")}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(28px,4vw,40px)] font-extrabold uppercase leading-[0.98] text-ink">
          {t("Your certificates")}
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          {t("Every goal you complete is issued a verifiable certificate and transcript.")}
        </p>
      </header>

      {certs.length === 0 ? (
        <div className="glass flex flex-col items-center gap-4 rounded-[var(--radius-card-lg)] px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-accent/12 text-accent">
            <AwardIcon className="size-7" />
          </span>
          <p className="max-w-[360px] text-[14px] text-muted">
            {t("No certificates yet. Finish a goal — mark it complete from its page — and your first one appears here.")}
          </p>
          <Link
            href="/app/goals"
            className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
          >
            {t("Go to goals")}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {certs.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/credential/${c.id}`}
                className="glass group flex items-center gap-4 rounded-[var(--radius-card-lg)] p-5 transition-colors hover:bg-white/80"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-[14px] text-white" style={{ background: "linear-gradient(135deg,#ff4326,#ff8a3d)" }}>
                  <AwardIcon className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15.5px] font-semibold text-ink">{c.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {t("Issued {date} · {done}/{total} sections · {time}", { date: fmtDate(locale, c.issued_at), done: c.sections_done, total: c.sections_total, time: timeLabel(c.minutes_total) })}
                    {c.overall ? ` · ${t(c.overall)}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted/80">{t("Credential {id}", { id: c.id })}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
