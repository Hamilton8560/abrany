"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { Goal, Plan, PlanItem, PlanItemWithProgress, Exam } from "@/lib/repo";
import { ArrowRight, CheckIcon, TargetIcon } from "@/components/icons";
import MilestoneLessons from "@/components/app/MilestoneLessons";
import ExamModal from "@/components/app/ExamModal";
import QueueHint from "@/components/app/QueueHint";
import DraftAssistant from "@/components/app/DraftAssistant";

type FullPlan = Plan & { items: PlanItemWithProgress[] };
type TrackChild = Goal & { hasPlan: boolean; milestones: number; sectionsTotal: number; sectionsDone: number };
type GoalResp = { goal: Goal; plan: FullPlan | null; children: TrackChild[] };

export default function GoalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [plan, setPlan] = useState<FullPlan | null>(null);
  const [children, setChildren] = useState<TrackChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cert, setCert] = useState<{ id: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examOpen, setExamOpen] = useState<Exam | null>(null);
  const [editing, setEditing] = useState(false);
  const [newMilestone, setNewMilestone] = useState("");
  // V2 intake — the coach calibrates the plan to these
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [level, setLevel] = useState<"new" | "some" | "solid">("some");
  const [hoursPerWeek, setHoursPerWeek] = useState(5);
  const [targetDate, setTargetDate] = useState("");
  const [focus, setFocus] = useState("");

  const loadExams = useCallback(() => {
    api<{ exams: Exam[] }>(`/api/goals/${id}/exams`)
      .then((r) => setExams(r.exams ?? []))
      .catch(() => {});
  }, [id]);

  const load = useCallback(async () => {
    const d = await api<GoalResp>(`/api/goals/${id}`);
    setGoal(d.goal);
    setPlan(d.plan);
    setChildren(d.children ?? []);
    setLoading(false);
    api<{ certificate: { id: string } | null }>(`/api/goals/${id}/complete`)
      .then((r) => setCert(r.certificate))
      .catch(() => {});
    if (!d.children?.length && d.plan) loadExams();
  }, [id, loadExams]);

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
      const d = await api<{ plan: FullPlan }>(`/api/goals/${id}/plan`, {
        method: "POST",
        body: JSON.stringify({ level, hoursPerWeek, targetDate: targetDate || undefined, focus: focus || undefined }),
      });
      setPlan(d.plan);
      setIntakeOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The coach couldn't build a plan right now.");
    } finally {
      setGenerating(false);
    }
  };

  /* ── course editing (edit mode) ── */
  const saveItem = async (itemId: number, fields: { title?: string; detail?: string }) => {
    await api(`/api/plan-items/${itemId}`, { method: "PATCH", body: JSON.stringify(fields) }).catch(() => {});
  };
  const moveItem = async (itemId: number, move: "up" | "down") => {
    await api(`/api/plan-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ move }) }).catch(() => {});
    load();
  };
  const removeItem = async (item: PlanItem) => {
    if (!window.confirm(`Delete milestone “${item.title}” and its sections?`)) return;
    await api(`/api/plan-items/${item.id}`, { method: "DELETE" }).catch(() => {});
    load();
  };
  const addMilestone = async () => {
    if (!newMilestone.trim()) return;
    await api("/api/plan-items", {
      method: "POST",
      body: JSON.stringify({ goalId: Number(id), title: newMilestone }),
    }).catch(() => {});
    setNewMilestone("");
    load();
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
  const finalExam = exams.find((e) => e.kind === "final");
  const finalPassed = !!finalExam?.passed;
  const canComplete = !finalExam || finalPassed;

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
                {c.hasPlan ? (
                  <span className="shrink-0 rounded-full bg-up/12 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-up">
                    {c.sectionsTotal > 0 ? `${c.sectionsDone}/${c.sectionsTotal} sections` : `Plan ready · ${c.milestones}`}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-ink/6 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                    Not started
                  </span>
                )}
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
            {plan && plan.version >= 2 && (
              <span className="ml-2 rounded-full bg-up/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-up">
                V2
              </span>
            )}
          </h2>
          {plan && (
            <span className="flex items-center gap-3">
              <button
                onClick={() => setEditing((v) => !v)}
                className={`text-[12px] font-medium ${editing ? "text-up" : "text-accent"} hover:underline`}
              >
                {editing ? "Done editing" : "Edit course"}
              </button>
              <button
                onClick={() => setIntakeOpen((v) => !v)}
                disabled={generating}
                className="text-[12px] font-medium text-accent hover:underline disabled:opacity-50"
              >
                {generating ? "Rebuilding…" : "Rebuild plan"}
              </button>
            </span>
          )}
        </div>

        {error && <p className="mt-3 text-[13px] text-accent">{error}</p>}

        {(!plan || intakeOpen) && (
          <div className={`mt-4 flex flex-col gap-3 rounded-[16px] border border-dashed border-line px-5 py-5 ${plan ? "" : "items-stretch"}`}>
            {!plan && (
              <p className="text-center text-[14px] text-muted">
                No plan yet. Tell your coach where you&apos;re starting from and it builds an
                outcome-based plan sized to your real time.
              </p>
            )}
            <DraftAssistant
              surfaceId="goalPlan"
              context={`This intake is for the goal "${goal.title}".${goal.description ? ` Details: ${goal.description}.` : ""}`}
              onApply={(v) => {
                if (v.level === "new" || v.level === "some" || v.level === "solid") setLevel(v.level);
                const h = Number(v.hoursPerWeek);
                if (Number.isFinite(h) && h > 0) setHoursPerWeek(Math.min(60, Math.max(1, Math.round(h))));
                if (v.targetDate) setTargetDate(v.targetDate);
                if (v.focus) setFocus(v.focus);
              }}
              triggerLabel="Not sure? Let AI set these up"
              className="self-start"
            />
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Current level
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as typeof level)}
                  className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
                >
                  <option value="new">Complete beginner</option>
                  <option value="some">Some experience</option>
                  <option value="solid">Solid — want depth</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Hours per week
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={hoursPerWeek}
                  onChange={(e) => setHoursPerWeek(Number(e.target.value) || 1)}
                  className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Target date (optional)
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Why / focus (optional)
                <input
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="e.g. conversation for a trip in October"
                  className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
                />
              </label>
            </div>
            <div className="flex justify-center">
              <button
                onClick={generate}
                disabled={generating}
                className="glassx-dark rounded-full px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-60"
              >
                {generating ? "Building your plan…" : plan ? "Rebuild my plan (V2)" : "Build my plan with AI"}
              </button>
            </div>
            {generating && (
              <div className="mx-auto max-w-[420px] text-center">
                <QueueHint />
              </div>
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
                let outcomes: string[] = [];
                try {
                  outcomes = JSON.parse(item.outcomes || "[]");
                } catch { /* legacy rows */ }
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
                      {editing ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              defaultValue={item.title}
                              onBlur={(e) => e.target.value.trim() && e.target.value !== item.title && saveItem(item.id, { title: e.target.value }).then(load)}
                              className="min-w-0 flex-1 rounded-full border border-line bg-white px-3 py-1.5 text-[13.5px] font-semibold text-ink outline-none focus:border-accent"
                            />
                            <button onClick={() => moveItem(item.id, "up")} disabled={i === 0} title="Move up" className="text-[13px] font-bold text-muted hover:text-ink disabled:opacity-30">↑</button>
                            <button onClick={() => moveItem(item.id, "down")} disabled={i === plan.items.length - 1} title="Move down" className="text-[13px] font-bold text-muted hover:text-ink disabled:opacity-30">↓</button>
                            <button onClick={() => removeItem(item)} title="Delete milestone" className="text-[13px] font-bold text-muted hover:text-accent">✕</button>
                          </div>
                          <input
                            defaultValue={item.detail}
                            placeholder="What to do and how to know you're done"
                            onBlur={(e) => e.target.value !== item.detail && saveItem(item.id, { detail: e.target.value }).then(load)}
                            className="rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] text-muted outline-none focus:border-accent"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between gap-3">
                            <p
                              className={`text-[14.5px] font-semibold ${
                                done ? "text-muted line-through" : "text-ink"
                              }`}
                            >
                              <span className="mr-1.5 text-muted">{i + 1}.</span>
                              {item.title}
                            </p>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {item.difficulty && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                    item.difficulty === "intro"
                                      ? "bg-up/12 text-up"
                                      : item.difficulty === "advanced"
                                        ? "bg-ink/10 text-ink"
                                        : "bg-accent/10 text-accent"
                                  }`}
                                >
                                  {item.difficulty}
                                </span>
                              )}
                              {item.estimate && (
                                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent">
                                  {item.estimate}
                                </span>
                              )}
                            </span>
                          </div>
                          {item.detail && (
                            <p className="mt-1 text-[13px] leading-snug text-muted">{item.detail}</p>
                          )}
                          {outcomes.length > 0 && (
                            <ul className="mt-1.5 flex flex-col gap-0.5">
                              {outcomes.map((o, j) => (
                                <li key={j} className="flex items-start gap-1.5 text-[12px] leading-snug text-muted">
                                  <CheckIcon className="mt-0.5 size-3 shrink-0 text-up" />
                                  <span>{o}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                      <MilestoneLessons planItemId={item.id} milestoneTitle={item.title} onProgress={load} editing={editing} />
                    </div>
                  </li>
                );
              })}
            </ol>
            {editing && (
              <div className="mt-3 flex gap-2">
                <input
                  value={newMilestone}
                  onChange={(e) => setNewMilestone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMilestone()}
                  placeholder="Add a milestone…"
                  className="min-w-0 flex-1 rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
                />
                <button
                  onClick={addMilestone}
                  disabled={!newMilestone.trim()}
                  className="glassx-dark shrink-0 rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {/* course exams — the final gates the certificate; reviews stay optional */}
      {!isUmbrella && exams.length > 0 && (
        <section className="glass rounded-[var(--radius-card-lg)] p-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink">Course exams</h2>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Each exam comes with a study guide. Pass the final (70%) to earn your certificate. The
            spaced reviews are optional practice to help you pass.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            {exams.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-[14px] bg-white/55 px-4 py-3.5">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    e.passed ? "bg-up/15 text-up" : "bg-accent/12 text-accent"
                  }`}
                >
                  {e.passed ? <CheckIcon className="size-4" /> : e.kind === "final" ? "F" : "M"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-ink">
                    {e.kind === "final" ? "Final exam" : "Midterm exam"}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {e.passed
                      ? `Passed · best score ${e.best_score}%`
                      : e.attempts > 0
                        ? `Best ${e.best_score}% · not passed yet (need 70%)`
                        : "Not attempted · includes a study guide"}
                  </p>
                </div>
                <button
                  onClick={() => setExamOpen(e)}
                  className={`shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold ${
                    e.passed ? "glassx text-ink" : "glassx-dark text-white"
                  }`}
                >
                  {e.passed ? "Review" : "Study & take"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* completion CTA — the certificate is earned by passing the final exam */}
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
          ) : !canComplete ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-semibold text-ink">Pass the final exam to graduate</p>
                <p className="mt-1 text-[13.5px] text-muted">
                  Your certificate is earned, not clicked — pass the final exam (70%) and it&apos;s issued
                  automatically.
                </p>
              </div>
              {finalExam && (
                <button
                  onClick={() => setExamOpen(finalExam)}
                  className="glassx-dark shrink-0 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
                >
                  Take the final exam
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-semibold text-ink">
                  {finalPassed ? "🎉 Final exam passed — claim your certificate" : "Finished this goal?"}
                </p>
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
                {finalPassed ? "Claim certificate" : "Mark this goal complete"}
              </button>
            </div>
          )}
        </section>
      )}

      {examOpen && (
        <ExamModal
          examId={examOpen.id}
          title={goal.title}
          kind={examOpen.kind}
          onClose={() => setExamOpen(null)}
          onGraded={loadExams}
        />
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
