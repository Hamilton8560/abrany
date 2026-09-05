"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import Markdown from "./Markdown";
import QueueHint from "./QueueHint";
import Portal from "./Portal";

type Verdict = "correct" | "partial" | "incorrect" | "revealed";
type Problem = {
  prompt: string;
  kind: "short" | "code" | "numeric" | "explain";
  difficulty: "warmup" | "core" | "stretch";
  starter: string;
  answerFormat: string;
  hintCount: number;
};
type Attempt = { index: number; answer: string; verdict: Verdict; feedback: string; hintsUsed: number };
type SetView = {
  id: number;
  status: "ready" | "done";
  summary: string;
  problems: Problem[];
  attempts: Attempt[];
  outcomes: (Verdict | null)[];
};
type Grade = { verdict: Exclude<Verdict, "revealed">; feedback: string; misconception: string; nextStep: string };

const DIFF: Record<Problem["difficulty"], { label: string; cls: string }> = {
  warmup: { label: "Warm-up", cls: "bg-up/15 text-up" },
  core: { label: "Core", cls: "bg-accent/12 text-accent" },
  stretch: { label: "Stretch", cls: "bg-ink/10 text-ink" },
};
const OUT: Record<Verdict, string> = {
  correct: "bg-up",
  partial: "bg-accent-2",
  incorrect: "bg-accent",
  revealed: "bg-ink/40",
};

/**
 * Work a lesson's practice set one problem at a time: attempt → hint ladder → AI check
 * (coaching feedback, not just a mark) → reveal if needed → easier variant when stuck →
 * debrief at the end. Finishing marks the section complete and graded.
 */
export default function PracticeSession({
  lessonId,
  lessonTitle,
  onClose,
  onFinished,
}: {
  lessonId: number;
  lessonTitle: string;
  onClose: () => void;
  onFinished?: () => void;
}) {
  const [set, setSet] = useState<SetView | null>(null);
  const [phase, setPhase] = useState<"loading" | "work" | "finishing" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [solution, setSolution] = useState<string | null>(null);
  const [variantBusy, setVariantBusy] = useState(false);
  const [finish, setFinish] = useState<{ summary: string; score: number; letter: string; enrolled: boolean } | null>(null);
  const started = useRef(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  const load = async (fresh = false) => {
    setPhase("loading");
    setError("");
    try {
      const d = await api<{ set: SetView }>(`/api/lessons/${lessonId}/practice`, {
        method: "POST",
        body: JSON.stringify({ fresh }),
      });
      setSet(d.set);
      // resume at the first problem without a good outcome
      const first = d.set.outcomes.findIndex((o) => o !== "correct" && o !== "revealed");
      goTo(first === -1 ? 0 : first, d.set);
      setPhase(d.set.status === "done" && !fresh ? "work" : "work");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start practice.");
      setPhase("error");
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (idx: number, s: SetView | null = set) => {
    setI(idx);
    setAnswer(s?.problems[idx]?.starter ?? "");
    setHints([]);
    setGrade(null);
    setSolution(null);
    setTimeout(() => answerRef.current?.focus(), 50);
  };

  const problem = set?.problems[i];
  const total = set?.problems.length ?? 0;
  const done = set?.outcomes.filter((o) => o === "correct" || o === "partial" || o === "revealed").length ?? 0;
  const priorForThis = set?.attempts.filter((a) => a.index === i) ?? [];

  const nextHint = async () => {
    if (!set || !problem || hints.length >= problem.hintCount) return;
    setHintBusy(true);
    try {
      const d = await api<{ hint: string }>(`/api/practice/${set.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "hint", index: i, rung: hints.length }),
      });
      setHints((h) => [...h, d.hint]);
    } catch {
      /* ignore */
    } finally {
      setHintBusy(false);
    }
  };

  const check = async () => {
    if (!set || !answer.trim() || checking) return;
    setChecking(true);
    setGrade(null);
    try {
      const d = await api<{ grade: Grade; set: SetView }>(`/api/practice/${set.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "check", index: i, answer, hintsUsed: hints.length }),
      });
      setGrade(d.grade);
      setSet(d.set);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check your answer.");
    } finally {
      setChecking(false);
    }
  };

  const reveal = async () => {
    if (!set) return;
    try {
      const d = await api<{ solution: string; set: SetView }>(`/api/practice/${set.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "reveal", index: i, hintsUsed: hints.length, answer }),
      });
      setSolution(d.solution);
      setSet(d.set);
    } catch {
      /* ignore */
    }
  };

  const variant = async (direction: "easier" | "harder") => {
    if (!set || variantBusy) return;
    setVariantBusy(true);
    try {
      const d = await api<{ index: number; set: SetView }>(`/api/practice/${set.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "variant", index: i, direction, struggle: grade?.misconception || grade?.feedback || undefined }),
      });
      setSet(d.set);
      goTo(d.index, d.set);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write another problem.");
    } finally {
      setVariantBusy(false);
    }
  };

  const finishSet = async () => {
    if (!set) return;
    setPhase("finishing");
    try {
      const d = await api<{ summary: string; score: number; letter: string; enrolled: boolean; set: SetView }>(
        `/api/practice/${set.id}`,
        { method: "POST", body: JSON.stringify({ action: "finish" }) },
      );
      setFinish(d);
      setSet(d.set);
      setPhase("done");
      onFinished?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish the session.");
      setPhase("work");
    }
  };

  const settled = grade?.verdict === "correct" || solution !== null;
  const isLast = i === total - 1;
  const remaining = set ? set.outcomes.filter((o) => o === null || o === "incorrect").length : 0;

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[55] grid place-items-start justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div className="glass my-auto w-full max-w-[760px] rounded-[var(--radius-card-lg)] p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Practice session</p>
            <h3 className="mt-1 font-display text-[clamp(18px,4vw,24px)] font-extrabold uppercase leading-[1.05] text-ink">{lessonTitle}</h3>
          </div>
          <button onClick={onClose} className="glassx shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink">
            {phase === "done" ? "Done" : "Close"}
          </button>
        </div>

        {phase === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-[14px] text-muted">Writing your problem set — warm-ups first, then the real thing…</p>
            <div className="max-w-[420px]">
              <QueueHint />
            </div>
          </div>
        )}
        {phase === "finishing" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-[14px] text-muted">Your coach is writing the debrief…</p>
          </div>
        )}
        {phase === "error" && (
          <div className="py-8 text-center">
            <p className="text-[14px] text-accent">{error}</p>
            <button onClick={() => load()} className="mt-4 glassx rounded-full px-5 py-2.5 text-[13px] font-semibold text-ink">
              Try again
            </button>
          </div>
        )}

        {phase === "work" && set && problem && (
          <div className="flex flex-col gap-4">
            {/* route */}
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1">
                {set.problems.map((p, k) => (
                  <button
                    key={k}
                    onClick={() => goTo(k)}
                    title={`${k + 1}. ${DIFF[p.difficulty].label}${set.outcomes[k] ? ` · ${set.outcomes[k]}` : ""}`}
                    className={`h-2 flex-1 rounded-full transition-all ${
                      set.outcomes[k] ? OUT[set.outcomes[k]!] : "bg-line"
                    } ${k === i ? "ring-2 ring-ink/40 ring-offset-1" : ""}`}
                  />
                ))}
              </div>
              <span className="shrink-0 text-[12px] text-muted">
                {i + 1} / {total} · {done} done
              </span>
            </div>

            {/* problem */}
            <div className="rounded-[14px] border border-line bg-white/60 p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${DIFF[problem.difficulty].cls}`}>
                  {DIFF[problem.difficulty].label}
                </span>
                <span className="text-[11px] text-muted">
                  {problem.kind === "code" ? "Code" : problem.kind === "numeric" ? "Calculate" : problem.kind === "explain" ? "Explain" : "Answer"}
                  {problem.answerFormat ? ` · ${problem.answerFormat}` : ""}
                </span>
                {set.outcomes[i] && (
                  <span className="ml-auto text-[11px] font-semibold capitalize text-muted">{set.outcomes[i]}</span>
                )}
              </div>
              <Markdown>{problem.prompt}</Markdown>
            </div>

            {/* hints */}
            {hints.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {hints.map((h, k) => (
                  <div key={k} className="rounded-[12px] bg-accent/8 px-4 py-2.5 text-[13px] text-ink">
                    <span className="mr-1.5 font-semibold text-accent">Hint {k + 1}.</span>
                    {h}
                  </div>
                ))}
              </div>
            )}

            {/* answer */}
            <textarea
              ref={answerRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={checking || solution !== null}
              rows={problem.kind === "code" ? 8 : problem.kind === "explain" ? 4 : 2}
              placeholder={problem.kind === "code" ? "Write your code here…" : "Your answer…"}
              spellCheck={problem.kind !== "code"}
              className={`w-full resize-y rounded-[12px] border border-line bg-white/80 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50 disabled:opacity-70 ${
                problem.kind === "code" ? "font-mono text-[13px]" : ""
              }`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  check();
                }
              }}
            />

            {/* feedback */}
            {grade && (
              <div
                className={`rounded-[14px] px-4 py-3.5 ${
                  grade.verdict === "correct" ? "bg-up/12" : grade.verdict === "partial" ? "bg-accent-2/12" : "bg-accent/10"
                }`}
              >
                <p className="text-[13px] font-semibold text-ink">
                  {grade.verdict === "correct" ? "✓ Correct" : grade.verdict === "partial" ? "Almost — partial credit" : "Not yet"}
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{grade.feedback}</p>
                {grade.nextStep && grade.verdict !== "correct" && (
                  <p className="mt-1.5 text-[12.5px] text-muted">
                    <span className="font-semibold text-ink">Try this:</span> {grade.nextStep}
                  </p>
                )}
              </div>
            )}
            {solution !== null && (
              <div className="rounded-[14px] border border-line bg-white/60 p-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Worked solution</p>
                <Markdown>{solution}</Markdown>
              </div>
            )}
            {error && phase === "work" && <p className="text-[12.5px] text-accent">{error}</p>}

            {/* actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-4">
              {!settled ? (
                <>
                  <button
                    onClick={check}
                    disabled={checking || !answer.trim()}
                    className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    {checking ? "Checking…" : grade ? "Check again" : "Check my answer"}
                  </button>
                  <button
                    onClick={nextHint}
                    disabled={hintBusy || hints.length >= problem.hintCount}
                    className="glassx rounded-full px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50"
                  >
                    {hints.length >= problem.hintCount ? "No more hints" : hints.length === 0 ? "Hint" : `Hint ${hints.length + 1} of ${problem.hintCount}`}
                  </button>
                  {(hints.length >= problem.hintCount || priorForThis.length >= 2) && (
                    <button onClick={reveal} className="rounded-full px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink">
                      Show solution
                    </button>
                  )}
                  {(grade?.verdict === "incorrect" || priorForThis.length >= 2) && (
                    <button
                      onClick={() => variant("easier")}
                      disabled={variantBusy}
                      className="ml-auto rounded-full px-4 py-2.5 text-[13px] font-semibold text-accent hover:underline disabled:opacity-50"
                    >
                      {variantBusy ? "Writing…" : "Give me an easier one"}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {!isLast ? (
                    <button onClick={() => goTo(i + 1)} className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white">
                      Next problem →
                    </button>
                  ) : (
                    <button onClick={finishSet} className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white">
                      Finish & debrief
                    </button>
                  )}
                  {grade?.verdict === "correct" && (
                    <button
                      onClick={() => variant("harder")}
                      disabled={variantBusy}
                      className="glassx rounded-full px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50"
                    >
                      {variantBusy ? "Writing…" : "Push me — a harder one"}
                    </button>
                  )}
                </>
              )}
              {isLast && !settled && remaining <= 1 && (
                <button onClick={finishSet} className="ml-auto rounded-full px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink">
                  Finish anyway
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted">
              Hints never give the answer. ⌘/Ctrl + Enter checks. Finishing marks this section complete with a grade.
            </p>
          </div>
        )}

        {phase === "done" && finish && set && (
          <div className="flex flex-col gap-5">
            <div className={`rounded-[16px] p-5 text-center ${finish.score >= 70 ? "bg-up/12" : "bg-accent/10"}`}>
              <p className={`font-display text-[40px] font-extrabold leading-none ${finish.score >= 70 ? "text-up" : "text-accent"}`}>
                {finish.letter}
              </p>
              <p className="mt-2 text-[14px] font-semibold text-ink">
                {finish.score}% · {set.outcomes.filter((o) => o === "correct").length} of {set.problems.length} solved outright
              </p>
              {finish.enrolled && <p className="mt-1 text-[12.5px] text-muted">Added to your spaced reviews — first check-in tomorrow.</p>}
            </div>
            <div className="rounded-[14px] border border-line bg-white/60 p-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-accent">Debrief</p>
              <Markdown>{finish.summary}</Markdown>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => load(true)} className="glassx rounded-full px-5 py-2.5 text-[13px] font-semibold text-ink">
                New set, fresh problems
              </button>
              <button onClick={onClose} className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}
