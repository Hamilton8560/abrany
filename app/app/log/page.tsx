"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDuration, fmtWhen } from "@/lib/client";
import type { SessionRow, SessionStats } from "@/lib/repo";
import LogReadingModal from "@/components/app/LogReadingModal";

type Resp = { sessions: SessionRow[]; stats: SessionStats };

export default function LogPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [logging, setLogging] = useState(false);

  const load = useCallback(() => {
    api<Resp>("/api/sessions")
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sessions = data?.sessions ?? [];

  // group by calendar day (local)
  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const d = new Date(s.created_at.replace(" ", "T") + "Z");
    const key = Number.isNaN(d.getTime())
      ? s.created_at.slice(0, 10)
      : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-8">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            TRAINING LOG
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-4">
          <h1 className="font-display text-[clamp(30px,4vw,42px)] font-extrabold uppercase leading-[0.98] text-ink">
            Everything you recorded
          </h1>
          <button
            type="button"
            onClick={() => setLogging(true)}
            className="glassx-dark shrink-0 rounded-full px-4 py-2.5 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Log reading
          </button>
        </div>
        {data && (
          <p className="mt-2 text-[14px] text-muted">
            {data.stats.sessionCount} sessions · {fmtDuration(data.stats.totalFocusSec)} of focused
            training logged.
          </p>
        )}
      </header>

      {sessions.length === 0 && (
        <p className="text-[14px] text-muted">
          Nothing logged yet. Run a focus block and record what you did.
        </p>
      )}

      <div className="flex flex-col gap-7">
        {[...groups.entries()].map(([day, items]) => (
          <section key={day} className="flex flex-col gap-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted">{day}</h2>
            {items.map((s) => {
              const reading = s.mode === "reading";
              // in-app book title from the FK join, else the external title in tags
              const bookLabel = reading ? s.book_title || s.tags : "";
              return (
                <article key={s.id} className="glass rounded-[var(--radius-card)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-ink">
                      {fmtDuration(s.duration_sec)} {reading ? "reading" : "focus"}
                    </span>
                    <span className="text-[11.5px] text-muted">{fmtWhen(s.created_at)}</span>
                  </div>
                  {reading && bookLabel && (
                    <p className="mt-1 text-[13.5px] font-medium text-ink/80">{bookLabel}</p>
                  )}
                  {s.notes && (
                    <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted">
                      {s.notes}
                    </p>
                  )}
                  {reading ? (
                    <span className="mt-2 inline-block rounded-full bg-up/10 px-2.5 py-0.5 text-[11px] font-medium text-up">
                      Reading · Comprehension
                    </span>
                  ) : (
                    s.goal_title && (
                      <span className="mt-2 inline-block rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                        {s.goal_title}
                      </span>
                    )
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      {logging && (
        <LogReadingModal
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false);
            load();
          }}
        />
      )}
    </div>
  );
}
