"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PomodoroTimer from "@/components/app/PomodoroTimer";
import { api, fmtDuration, fmtWhen } from "@/lib/client";
import type { GoalListItem as Goal, Session, SessionStats } from "@/lib/repo";
import { ArrowRight, TargetIcon, BuildingIcon } from "@/components/icons";

type SessionsResp = { sessions: (Session & { goal_title: string | null })[]; stats: SessionStats };

export default function Dashboard() {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [sessions, setSessions] = useState<(Session & { goal_title: string | null })[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const load = useCallback(async () => {
    const [s, g] = await Promise.all([
      api<SessionsResp>("/api/sessions"),
      api<{ goals: Goal[] }>("/api/goals"),
    ]);
    setStats(s.stats);
    setSessions(s.sessions.slice(0, 5));
    setGoals(g.goals.filter((x) => x.status === "active"));
  }, []);

  const assigned = goals.filter((g) => g.assigned_org);
  const own = goals.filter((g) => !g.assigned_org).slice(0, 4);

  useEffect(() => {
    load().catch(() => {});
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

      {/* company-assigned training comes first: it has deadlines */}
      {assigned.length > 0 && (
        <section className="glass rounded-[var(--radius-card-lg)] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-ink">
              <BuildingIcon className="size-4 text-accent" /> Assigned to you
            </h2>
            <Link href="/app/org" className="text-[12px] font-medium text-accent hover:underline">
              My company
            </Link>
          </div>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {assigned.map((g) => {
              const dl = g.assignment_due ? Math.ceil((new Date(g.assignment_due).getTime() - Date.now()) / 86_400_000) : null;
              const pct = g.sections_total > 0 ? Math.round((g.sections_done / g.sections_total) * 100) : 0;
              const building = g.build_status === "queued" || g.build_status === "building";
              const passed = g.assignment_status === "passed";
              return (
                <li key={g.id}>
                  <Link
                    href={`/app/goals/${g.id}`}
                    className="group flex flex-col gap-2 rounded-[14px] bg-white/60 px-4 py-3.5 transition-colors hover:bg-white/90"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[14px] font-semibold text-ink">{g.title}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          passed ? "bg-up/15 text-up" : g.assignment_status === "failed" ? "bg-accent/15 text-accent" : "bg-ink/8 text-muted"
                        }`}
                      >
                        {passed ? "Passed" : g.assignment_status === "failed" ? "Past due" : building ? "Building" : g.assignment_status === "in_progress" ? "In progress" : "New"}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      {g.assigned_org}
                      {g.assignment_due && !passed && (
                        <span className={dl !== null && dl < 3 ? " font-semibold text-accent" : ""}>
                          {" · "}
                          {dl !== null && dl >= 0 ? `${dl} day${dl === 1 ? "" : "s"} left` : "overdue"}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <span className="block h-full rounded-full bg-up transition-all" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="text-[11px] text-muted">
                        {building ? "preparing…" : g.sections_total > 0 ? `${g.sections_done}/${g.sections_total}` : "—"}
                      </span>
                    </div>
                    <span className="text-[12px] font-semibold text-accent">
                      {passed ? "View certificate" : g.sections_done > 0 ? "Continue" : "Start"} →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* timer */}
        <section className="glass rounded-[var(--radius-card-lg)] p-6 sm:p-8">
          <PomodoroTimer onLogged={load} />
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
              {own.length === 0 && (
                <Link
                  href="/app/goals"
                  className="flex items-center gap-2 rounded-[13px] border border-dashed border-line px-3.5 py-4 text-[13px] text-muted hover:border-accent/50 hover:text-ink"
                >
                  <TargetIcon className="size-[18px]" /> Set your first goal →
                </Link>
              )}
              {own.map((g) => (
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
              {sessions.map((s) => (
                <div key={s.id} className="flex flex-col gap-0.5 border-b border-line/70 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-ink">
                      {fmtDuration(s.duration_sec)} focus
                    </span>
                    <span className="text-[11px] text-muted">{fmtWhen(s.created_at)}</span>
                  </div>
                  {s.notes && <p className="line-clamp-2 text-[12.5px] leading-snug text-muted">{s.notes}</p>}
                  {s.goal_title && (
                    <span className="mt-0.5 w-fit rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent">
                      {s.goal_title}
                    </span>
                  )}
                </div>
              ))}
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
