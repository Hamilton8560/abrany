"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { Goal, Plan, PlanItem, PlanItemWithProgress } from "@/lib/repo";
import { ArrowRight, CheckIcon, TargetIcon } from "@/components/icons";
import MilestoneLessons from "@/components/app/MilestoneLessons";

type FullPlan = Plan & { items: PlanItemWithProgress[] };
type GoalResp = { goal: Goal; plan: FullPlan | null; children: Goal[] };

export default function GoalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [plan, setPlan] = useState<FullPlan | null>(null);
  const [children, setChildren] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cert, setCert] = useState<{ id: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    const d = await api<GoalResp>(`/api/goals/${id}`);
    setGoal(d.goal);
    setPlan(d.plan);
    setChildren(d.children ?? []);
    setLoading(false);
    api<{ certificate: { id: string } | null }>(`/api/goals/${id}/complete`)
      .then((r) => setCert(r.certificate))
      .catch(() => {});
  }, [id]);

  const completeGoal = async () => {
    setCompleting(true);
    setError(null);
    try {
      const d = await api<{ certificate: { id: string } }>(`/api/goals/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
      setGoal((g) => (g ? { ...g, status: "done" } : g));
      setConfirmOpen(false);
      router.push(`/app/credential/${d.certificate.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the goal.");
    } finally {
      setCompleting(false);
    }
  };

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

  const isUmbrella = children.length > 0;
  const items = plan?.items ?? [];
  const total = items.length;
  // Section-weighted progress: a milestone split into lessons counts each read
  // section; an un-expanded milestone counts as one unit (done when checked).
  let units = 0;
  let unitsDone = 0;
  let sectionsTotal = 0;
  let sectionsDone = 0;
  for (const it of items) {
    if (it.lessons_total > 0) {
      units += it.lessons_total;
      unitsDone += it.lessons_done;
      sectionsTotal += it.lessons_total;
      sectionsDone += it.lessons_done;
    } else {
      units += 1;
      unitsDone += it.status === "done" ? 1 : 0;
    }
  }
  const progress = units ? Math.round((unitsDone / units) * 100) : 0;

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
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[12px] font-semibold text-ink">{progress}%</span>
            </div>
            <p className="text-[11px] text-muted">
              {sectionsTotal > 0
                ? `${sectionsDone}/${sectionsTotal} sections read`
                : "Break a milestone into sections and check them off as you read"}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2.5">
          <Link
            href={`/app/coach?goal=${goal.id}`}
            className="glassx-dark rounded-full px-4 py-2 text-[12.5px] font-semibold text-white"
          >
            Discuss with coach
          </Link>
          {goal.status === "done" && (
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

      {/* umbrella: this goal was too broad, so it's split into tracks */}
      {isUmbrella && (
        <section className="glass rounded-[var(--radius-card-lg)] p-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink">
            Tracks — start anywhere
          </h2>
          <p className="mt-1.5 text-[13.5px] text-muted">
            This is a big one, so your coach split it into standalone tracks. Open one to build its
            plan and lessons.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            {children.map((c, i) => (
              <Link
                key={c.id}
                href={`/app/goals/${c.id}`}
                className="group flex items-center gap-3.5 rounded-[14px] bg-white/55 px-4 py-3.5 transition-colors hover:bg-white/85"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/12 text-[12px] font-bold text-accent">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-ink">{c.title}</p>
                  {c.description && (
                    <p className="truncate text-[12.5px] text-muted">{c.description}</p>
                  )}
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* plan */}
      {!isUmbrella && (
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
                      <MilestoneLessons planItemId={item.id} milestoneTitle={item.title} onProgress={load} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
      )}

      {/* completion CTA — issuing a credential requires an explicit confirmation */}
      {!isUmbrella && (
        <section className="glass rounded-[var(--radius-card-lg)] p-6">
          {cert ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-semibold text-ink">🎓 Certificate issued</p>
                <p className="mt-1 text-[13.5px] text-muted">
                  You completed this goal. Credential <span className="font-medium text-ink">{cert.id}</span>.
                </p>
              </div>
              <Link
                href={`/app/credential/${cert.id}`}
                className="glassx-dark shrink-0 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
              >
                View certificate
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-semibold text-ink">Finished this goal?</p>
                <p className="mt-1 text-[13.5px] text-muted">
                  Confirm you&apos;ve completed everything — we&apos;ll issue your certificate and transcript.
                </p>
              </div>
              <button
                onClick={() => {
                  setConfirmChecked(false);
                  setError(null);
                  setConfirmOpen(true);
                }}
                className="glassx-dark shrink-0 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
              >
                Mark this goal complete
              </button>
            </div>
          )}
        </section>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="glass w-full max-w-[440px] rounded-[var(--radius-card-lg)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[22px] font-extrabold uppercase text-ink">Complete this goal?</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              This issues your certificate &amp; transcript for{" "}
              <span className="font-semibold text-ink">{goal.title}</span> — a permanent, shareable record.
              Only confirm if you&apos;ve genuinely finished.
            </p>
            {sectionsTotal > 0 && (
              <p className="mt-3 rounded-[12px] bg-white/60 px-4 py-2.5 text-[13px] text-muted">
                Progress: <span className="font-semibold text-ink">{sectionsDone}/{sectionsTotal} sections</span> · {progress}%
                {sectionsDone < sectionsTotal ? " — some sections aren't marked done yet." : ""}
              </p>
            )}
            <label className="mt-4 flex items-start gap-2.5 text-[13.5px] text-ink">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5 size-4 accent-accent"
              />
              <span>I confirm I&apos;ve completed everything in this goal.</span>
            </label>
            {error && <p className="mt-3 text-[13px] text-accent">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 text-[13px] font-semibold text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={completeGoal}
                disabled={!confirmChecked || completing}
                className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {completing ? "Issuing…" : "Complete & issue certificate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
