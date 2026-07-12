"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { Goal, Plan, PlanItem } from "@/lib/repo";
import { CheckIcon, TargetIcon } from "@/components/icons";

type FullPlan = Plan & { items: PlanItem[] };
type GoalResp = { goal: Goal; plan: FullPlan | null };

export default function GoalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [plan, setPlan] = useState<FullPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api<GoalResp>(`/api/goals/${id}`);
    setGoal(d.goal);
    setPlan(d.plan);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const d = await api<{ plan: FullPlan }>(`/api/goals/${id}/plan`, { method: "POST" });
      setPlan(d.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The coach couldn't build a plan right now.");
    } finally {
      setGenerating(false);
    }
  };

  const toggleItem = async (item: PlanItem) => {
    const next = item.status === "done" ? "todo" : "done";
    setPlan((p) =>
      p ? { ...p, items: p.items.map((i) => (i.id === item.id ? { ...i, status: next } : i)) } : p,
    );
    await api(`/api/plan-items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    }).catch(() => load());
  };

  const setStatus = async (status: Goal["status"]) => {
    const d = await api<{ goal: Goal }>(`/api/goals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setGoal(d.goal);
  };

  const remove = async () => {
    await api(`/api/goals/${id}`, { method: "DELETE" });
    router.push("/app/goals");
  };

  if (loading) return <p className="text-[14px] text-muted">Loading…</p>;
  if (!goal) return <p className="text-[14px] text-muted">Goal not found.</p>;

  const doneCount = plan?.items.filter((i) => i.status === "done").length ?? 0;
  const total = plan?.items.length ?? 0;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-7">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <Link href="/app/goals" className="hover:text-ink">
          Goals
        </Link>
        <span>/</span>
        <span className="text-ink">{goal.title}</span>
      </div>

      <header className="glass flex flex-col gap-4 rounded-[var(--radius-card-lg)] p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-accent/12 text-accent">
            <TargetIcon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[clamp(24px,3.5vw,34px)] font-extrabold uppercase leading-[1] text-ink">
              {goal.title}
            </h1>
            {goal.description && <p className="mt-2 text-[14px] text-muted">{goal.description}</p>}
          </div>
        </div>

        {total > 0 && (
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[12px] font-semibold text-ink">
              {doneCount}/{total}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2.5">
          <Link
            href={`/app/coach?goal=${goal.id}`}
            className="glassx-dark rounded-full px-4 py-2 text-[12.5px] font-semibold text-white"
          >
            Discuss with coach
          </Link>
          {goal.status !== "done" ? (
            <button
              onClick={() => setStatus("done")}
              className="glassx rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink"
            >
              Mark complete
            </button>
          ) : (
            <button
              onClick={() => setStatus("active")}
              className="glassx rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink"
            >
              Reopen
            </button>
          )}
          <button
            onClick={remove}
            className="rounded-full px-4 py-2 text-[12.5px] font-semibold text-muted hover:text-accent"
          >
            Delete
          </button>
        </div>
      </header>

      {/* plan */}
      <section className="glass rounded-[var(--radius-card-lg)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink">
            Learning plan
          </h2>
          {plan && (
            <button
              onClick={generate}
              disabled={generating}
              className="text-[12px] font-medium text-accent hover:underline disabled:opacity-50"
            >
              {generating ? "Rebuilding…" : "Rebuild plan"}
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-[13px] text-accent">{error}</p>}

        {!plan && (
          <div className="mt-5 flex flex-col items-center gap-4 rounded-[16px] border border-dashed border-line px-6 py-10 text-center">
            <p className="max-w-[360px] text-[14px] text-muted">
              No plan yet. Let your coach break this goal into realistic, staged milestones.
            </p>
            <button
              onClick={generate}
              disabled={generating}
              className="glassx-dark rounded-full px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {generating ? "Building your plan…" : "Build my plan with AI"}
            </button>
            {generating && (
              <p className="text-[11.5px] text-muted">
                Queued through MiniMax — this can take a few seconds.
              </p>
            )}
          </div>
        )}

        {plan && (
          <div className="mt-4">
            {plan.summary && (
              <p className="rounded-[14px] bg-white/55 px-4 py-3 text-[13.5px] leading-relaxed text-muted">
                {plan.summary}
              </p>
            )}
            <ol className="mt-4 flex flex-col gap-2.5">
              {plan.items.map((item, i) => {
                const done = item.status === "done";
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3.5 rounded-[14px] bg-white/55 px-4 py-3.5"
                  >
                    <button
                      onClick={() => toggleItem(item)}
                      aria-label={done ? "Mark not done" : "Mark done"}
                      className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition-all ${
                        done
                          ? "border-up bg-up text-white"
                          : "border-line bg-white text-transparent hover:border-accent"
                      }`}
                    >
                      <CheckIcon className="size-3.5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p
                          className={`text-[14.5px] font-semibold ${
                            done ? "text-muted line-through" : "text-ink"
                          }`}
                        >
                          <span className="mr-1.5 text-muted">{i + 1}.</span>
                          {item.title}
                        </p>
                        {item.estimate && (
                          <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent">
                            {item.estimate}
                          </span>
                        )}
                      </div>
                      {item.detail && (
                        <p className="mt-1 text-[13px] leading-snug text-muted">{item.detail}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
