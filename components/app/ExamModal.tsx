"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import Markdown from "./Markdown";

type Phase = "loading" | "study" | "answering" | "grading" | "result" | "error";
type Verdict = "correct" | "partial" | "incorrect";
type GradeResult = { results: { verdict: Verdict; feedback: string }[]; summary: string };
type Result = { score: number; pass: boolean; passScore: number; grade: GradeResult };

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  correct: { label: "Correct", cls: "bg-up/15 text-up" },
  partial: { label: "Partial", cls: "bg-accent-2/15 text-accent-2" },
  incorrect: { label: "Missed", cls: "bg-accent/12 text-accent" },
};

/** Study guide → sit the exam → AI-graded result. Passing (≥70%) unlocks the certificate. */
export default function ExamModal({
  examId,
  title,
  kind,
  onClose,
  onGraded,
}: {
  examId: number;
  title: string;
  kind: "midterm" | "final";
  onClose: () => void;
  onGraded: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [guide, setGuide] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  const prepare = async () => {
    setPhase("loading");
    setError("");
    try {
      const d = await api<{ exam: { study_guide: string }; questions: { question: string }[] }>(
        `/api/exams/${examId}`,
        { method: "POST" },
      );
      setGuide(d.exam.study_guide || "");
      setQuestions(d.questions.map((q) => q.question));
      setAnswers(new Array(d.questions.length).fill(""));
      setResult(null);
      setPhase("study");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare the exam.");
      setPhase("error");
    }
  };
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      prepare();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setPhase("grading");
    try {
      const items = questions.map((q, i) => ({ question: q, answer: answers[i] || "" }));
      const d = await api<Result>(`/api/exams/${examId}/grade`, { method: "POST", body: JSON.stringify({ items }) });
      setResult(d);
      setPhase("result");
      onGraded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not grade the exam.");
      setPhase("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div className="glass my-auto w-full max-w-[720px] rounded-[var(--radius-card-lg)] p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              {kind === "final" ? "Final exam" : "Midterm exam"}
            </p>
            <h3 className="mt-1 font-display text-[clamp(20px,5vw,26px)] font-extrabold uppercase leading-[1.05] text-ink">{title}</h3>
          </div>
          <button onClick={onClose} className="glassx shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink">Close</button>
        </div>

        {phase === "loading" && (
          <p className="py-10 text-center text-[14px] text-muted">Preparing your study guide and exam…</p>
        )}

        {phase === "study" && (
          <div>
            <div className="rounded-[14px] border border-line bg-white/60 p-5">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Study guide</p>
              {guide ? <Markdown>{guide}</Markdown> : <p className="text-[14px] text-muted">No study guide available.</p>}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-[12.5px] text-muted">{questions.length} questions · pass at 70%</p>
              <button onClick={() => setPhase("answering")} className="glassx-dark rounded-full px-6 py-3 text-[14px] font-semibold text-white">
                Start the exam →
              </button>
            </div>
          </div>
        )}

        {phase === "answering" && (
          <div className="flex flex-col gap-5">
            {questions.map((q, i) => (
              <div key={i}>
                <p className="text-[14px] font-semibold text-ink">
                  <span className="mr-1.5 text-muted">{i + 1}.</span>
                  {q}
                </p>
                <textarea
                  value={answers[i]}
                  onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                  rows={2}
                  placeholder="Your answer…"
                  className="mt-2 w-full resize-none rounded-[12px] border border-line bg-white/80 px-4 py-2.5 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => setPhase("study")} className="text-[13px] font-semibold text-muted hover:text-ink">← Back to study guide</button>
              <button onClick={submit} className="glassx-dark rounded-full px-6 py-3 text-[14px] font-semibold text-white">Submit exam</button>
            </div>
          </div>
        )}

        {phase === "grading" && <p className="py-10 text-center text-[14px] text-muted">Grading your answers…</p>}

        {phase === "result" && result && (
          <div className="flex flex-col gap-5">
            <div className={`rounded-[16px] p-5 text-center ${result.pass ? "bg-up/12" : "bg-accent/10"}`}>
              <p className={`font-display text-[40px] font-extrabold leading-none ${result.pass ? "text-up" : "text-accent"}`}>{result.score}%</p>
              <p className="mt-2 text-[15px] font-semibold text-ink">
                {result.pass ? (kind === "final" ? "Passed! You can now claim your certificate." : "Midterm passed — keep going!") : `Not yet — you need ${result.passScore}%. Review and retake.`}
              </p>
              {result.grade.summary && <p className="mt-1 text-[13px] text-muted">{result.grade.summary}</p>}
            </div>
            <div className="flex flex-col gap-3">
              {result.grade.results.map((r, i) => (
                <div key={i} className="rounded-[12px] border border-line bg-white/60 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-ink">Question {i + 1}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${VERDICT[r.verdict].cls}`}>{VERDICT[r.verdict].label}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{r.feedback}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              {!result.pass && (
                <button onClick={prepare} className="glassx rounded-full px-5 py-2.5 text-[13px] font-semibold text-ink">Retake with new questions</button>
              )}
              <button onClick={onClose} className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white">Done</button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="py-8 text-center">
            <p className="text-[14px] text-accent">{error}</p>
            <button onClick={prepare} className="mt-4 glassx rounded-full px-5 py-2.5 text-[13px] font-semibold text-ink">Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
