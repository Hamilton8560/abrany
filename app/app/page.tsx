"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import FocusCard from "@/components/app/FocusCard";
import { api, fmtDuration, fmtWhen } from "@/lib/client";
import type { Goal, SessionRow, SessionStats } from "@/lib/repo";
import { ArrowRight, TargetIcon } from "@/components/icons";

type SessionsResp = { sessions: SessionRow[]; stats: SessionStats };

export default function Dashboard() {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const load = useCallback(async () => {
    const [s, g] = await Promise.all([
      api<SessionsResp>("/api/sessions"),
      api<{ goals: Goal[] }>("/api/goals"),
    ]);
    setStats(s.stats);
    setSessions(s.sessions.slice(0, 5));
    setGoals(g.goals.filter((x) => x.status === "active").slice(0, 4));
  }, []);

  useEffect(() => {
    load().catch(() => {});
    // refresh when the timer bridge logs a completed block
    const onLogged = () => load().catch(() => {});
    window.addEventListener("abrany:session-logged", onLogged);
    return () => window.removeEventListener("abrany:session-logged", onLogged);
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-[2px] w-[26px] bg-accent" />
            <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
              YOUR TRAINING
            </span>
          </div>
          <h1 className="mt-3 font-display text-[clamp(30px,4vw,42px)] font-extrabold uppercase leading-[0.98] text-ink">
            Train by recording
          </h1>
        </div>
        <div className="flex gap-3">
          <StatTile label="Today" value={stats ? fmtDuration(stats.todayFocusSec) : "—"} />
          <StatTile label="Sessions" value={stats ? String(stats.sessionCount) : "—"} />
          <StatTile label="Total focus" value={stats ? fmtDuration(stats.totalFocusSec) : "—"} accent />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* timer */}
        <section className="glass rounded-[var(--radius-card-lg)] p-6 sm:p-8">
          <FocusCard />
        </section>

        {/* side column */}
        <div className="flex flex-col gap-6">
          <section className="glass rounded-[var(--radius-card-lg)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink">
                Active goals
              </h2>
              <Link href="/app/goals" className="text-[12px] font-medium text-accent hover:underline">
                All
              </Link>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              {goals.length === 0 && (
                <Link
                  href="/app/goals"
                  className="flex items-center gap-2 rounded-[13px] border border-dashed border-line px-3.5 py-4 text-[13px] text-muted hover:border-accent/50 hover:text-ink"
                >
                  <TargetIcon className="size-[18px]" /> Set your first goal →
                </Link>
              )}
              {goals.map((g) => (
                <Link
                  key={g.id}
                  href={`/app/goals/${g.id}`}
                  className="group flex items-center justify-between rounded-[13px] bg-white/55 px-3.5 py-3 transition-colors hover:bg-white/80"
                >
                  <span className="truncate pr-2 text-[13.5px] font-medium text-ink">{g.title}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>

          <section className="glass rounded-[var(--radius-card-lg)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink">
                Recent sessions
              </h2>
              <Link href="/app/log" className="text-[12px] font-medium text-accent hover:underline">
                Log
              </Link>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {sessions.length === 0 && (
                <p className="text-[13px] text-muted">No sessions yet — run a focus block above.</p>
              )}
              {sessions.map((s) => {
                const reading = s.mode === "reading";
                const bookLabel = reading ? s.book_title || s.tags : "";
                return (
                  <div key={s.id} className="flex flex-col gap-0.5 border-b border-line/70 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-semibold text-ink">
                        {fmtDuration(s.duration_sec)} {reading ? "reading" : "focus"}
                      </span>
                      <span className="text-[11px] text-muted">{fmtWhen(s.created_at)}</span>
                    </div>
                    {reading && bookLabel && (
                      <p className="line-clamp-1 text-[12.5px] font-medium text-ink/80">{bookLabel}</p>
                    )}
                    {s.notes && <p className="line-clamp-2 text-[12.5px] leading-snug text-muted">{s.notes}</p>}
                    {!reading && s.goal_title && (
                      <span className="mt-0.5 w-fit rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent">
                        {s.goal_title}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glassx flex min-w-[92px] flex-col rounded-[15px] px-4 py-2.5">
      <span className={`text-[19px] font-semibold tabular-nums ${accent ? "text-accent" : "text-ink"}`}>
        {value}
      </span>
      <span className="text-[10.5px] text-muted">{label}</span>
    </div>
  );
}
