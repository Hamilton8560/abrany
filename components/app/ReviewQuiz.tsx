"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Rating } from "@/lib/srs";
import { CheckIcon, XIcon } from "@/components/icons";

type Verdict = "correct" | "partial" | "incorrect";
type Grade = {
  results: { verdict: Verdict; feedback: string }[];
  summary: string;
  suggested: Rating;
};

const VERDICT_UI: Record<Verdict, { label: string; cls: string }> = {
  correct: { label: "Correct", cls: "bg-up/15 text-up" },
  partial: { label: "Partial", cls: "bg-accent-2/15 text-accent-2" },
  incorrect: { label: "Missed", cls: "bg-accent/12 text-accent" },
};

/**
 * "Quiz me": the coach generates fresh recall questions from the lesson, you
 * type answers, and it grades them — feeding a suggested spaced-repetition rating.
 * Two on-demand MiniMax calls (generate + grade), both queued.
 */
export default function ReviewQuiz({
  lessonId,
  onSuggest,
}: {
  lessonId: number;
  onSuggest: (r: Rating) => void;
}) {
  const [phase, setPhase] = useState<"loading" | "answering" | "grading" | "done" | "error">(
    "loading",
  );
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ questions: { question: string }[] }>(`/api/lessons/${lessonId}/quiz`, { method: "POST" })
      .then((d) => {
        setQuestions(d.questions.map((q) => q.question));
        setAnswers(d.questions.map(() => ""));
        setPhase("answering");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Coach is unavailable");
        setPhase("error");
      });
  }, [lessonId]);

  const submit = async () => {
    setPhase("grading");
    try {
      const d = await api<{ grade: Grade }>(`/api/lessons/${lessonId}/grade`, {
        method: "POST",
        body: JSON.stringify({
          items: questions.map((question, i) => ({ question, answer: answers[i] })),
        }),
      });
      setGrade(d.grade);
      setPhase("done");
      onSuggest(d.grade.suggested);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not grade");
      setPhase("error");
    }
  };

  if (phase === "loading")
    return (
      <div className="mt-4 rounded-[14px] border border-line bg-white/40 px-4 py-6 text-center text-[13px] text-muted">
        Your coach is writing a quiz… <span className="text-[11px]">(queued through MiniMax)</span>
      </div>
    );

  if (phase === "error")
    return (
      <div className="mt-4 rounded-[14px] bg-accent/8 px-4 py-4 text-[13px] text-accent">
        {error || "Something went wrong."} You can still self-rate below.
      </div>
    );

  return (
    <div className="mt-4 flex flex-col gap-4">
      {questions.map((q, i) => (
        <div key={i} className="rounded-[14px] bg-white/55 p-4">
          <p className="text-[14px] font-semibold text-ink">
            <span className="mr-1.5 text-muted">{i + 1}.</span>
            {q}
          </p>
          <textarea
            value={answers[i]}
            onChange={(e) =>
              setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))
            }
            disabled={phase !== "answering"}
            rows={2}
            placeholder="Your answer…"
            className="mt-2 w-full resize-none rounded-[12px] border border-line bg-white/70 px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50 disabled:opacity-70"
          />
          {grade?.results[i] && (
            <div className="mt-2 flex items-start gap-2">
              <span
                className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${VERDICT_UI[grade.results[i].verdict].cls}`}
              >
                {grade.results[i].verdict === "incorrect" ? (
                  <XIcon className="size-2.5" />
                ) : (
                  <CheckIcon className="size-2.5" />
                )}
                {VERDICT_UI[grade.results[i].verdict].label}
              </span>
              <p className="text-[12.5px] leading-snug text-muted">{grade.results[i].feedback}</p>
            </div>
          )}
        </div>
      ))}

      {phase === "answering" && (
        <button
          onClick={submit}
          className="glassx-dark self-start rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
        >
          Submit for grading
        </button>
      )}
      {phase === "grading" && (
        <p className="text-[13px] text-muted">Grading your answers…</p>
      )}
      {phase === "done" && grade && (
        <div className="rounded-[14px] bg-accent/8 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Coach&apos;s take
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{grade.summary}</p>
          <p className="mt-1.5 text-[12px] text-muted">
            Suggested rating below: <b className="capitalize text-ink">{grade.suggested}</b>
          </p>
        </div>
      )}
    </div>
  );
}
