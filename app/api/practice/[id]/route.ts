import { NextResponse } from "next/server";
import {
  getPracticeSet,
  userOwnsPracticeSet,
  parseProblems,
  addAttempt,
  listAttempts,
  insertProblem,
  outcomes,
  finishPracticeSet,
  scoreSet,
  practiceSetView as setView,
} from "@/lib/practice";
import { getLesson, setLessonGrade, setLessonCompleted, autoEnrollLesson, scoreToLetter } from "@/lib/repo";
import { gradePracticeAttempt, generateVariantProblem, debriefPracticeSet } from "@/lib/coach";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { llmContext, withLlm } from "@/lib/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Actions on a practice set — body { action, ... }:
 *  - hint    { index, rung }         → the hint text for that rung (0-2); no AI
 *  - check   { index, answer, hintsUsed } → AI-graded attempt with coaching feedback
 *  - reveal  { index, hintsUsed }    → the worked solution (recorded as 'revealed')
 *  - variant { index, direction, struggle? } → insert an easier/harder problem after index
 *  - finish  {}                      → debrief + score; marks the lesson complete + graded
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const setId = Number(id);
  if (!userOwnsPracticeSet(user.id, setId)) return forbidden();
  const set = getPracticeSet(setId)!;
  const problems = parseProblems(set);
  const body = await req.json().catch(() => ({}));
  const index = Number(body.index);
  const problem = problems[index];
  const lesson = getLesson(set.lesson_id);
  const hintsUsed = Math.max(0, Math.min(3, Number(body.hintsUsed) || 0));

  switch (body.action) {
    case "hint": {
      if (!problem) return NextResponse.json({ error: "No such problem" }, { status: 400 });
      const rung = Math.max(0, Math.min(problem.hints.length - 1, Number(body.rung) || 0));
      return NextResponse.json({ hint: problem.hints[rung], rung, total: problem.hints.length });
    }
    case "reveal": {
      if (!problem) return NextResponse.json({ error: "No such problem" }, { status: 400 });
      addAttempt({ setId, problemIndex: index, answer: (body.answer ?? "").toString(), verdict: "revealed", feedback: "", hintsUsed });
      return NextResponse.json({ solution: problem.solution, set: setView(setId) });
    }
    case "check": {
      if (!problem) return NextResponse.json({ error: "No such problem" }, { status: 400 });
      const answer = (body.answer ?? "").toString();
      if (!answer.trim()) return NextResponse.json({ error: "Write an answer first." }, { status: 400 });
      const llm = llmContext(user);
      if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
      const prior = listAttempts(setId)
        .filter((a) => a.problem_index === index && a.verdict !== "revealed")
        .map((a) => a.answer);
      try {
        const grade = await withLlm(
          llm.creds,
          () => gradePracticeAttempt({ lessonTitle: lesson?.title ?? "", problem, answer, hintsUsed, priorAttempts: prior }),
          user.language,
        );
        addAttempt({ setId, problemIndex: index, answer, verdict: grade.verdict, feedback: grade.feedback, hintsUsed });
        return NextResponse.json({ grade, set: setView(setId) });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Could not check the answer" }, { status: 502 });
      }
    }
    case "variant": {
      if (!problem) return NextResponse.json({ error: "No such problem" }, { status: 400 });
      const llm = llmContext(user);
      if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
      const direction = body.direction === "harder" ? "harder" : "easier";
      try {
        const variant = await withLlm(
          llm.creds,
          () =>
            generateVariantProblem({
              lessonTitle: lesson?.title ?? "",
              content: lesson?.content ?? "",
              problem,
              direction,
              struggle: typeof body.struggle === "string" ? body.struggle.slice(0, 600) : undefined,
            }),
          user.language,
        );
        const at = insertProblem(setId, index, variant);
        return NextResponse.json({ index: at, set: setView(setId) });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Could not write a variant" }, { status: 502 });
      }
    }
    case "finish": {
      const llm = llmContext(user);
      if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });
      const results = outcomes(setId, problems.length);
      const attempts = listAttempts(setId);
      const perProblem = problems.map((_, i) => {
        const mine = attempts.filter((a) => a.problem_index === i);
        return {
          verdict: results[i],
          hintsUsed: mine.reduce((m, a) => Math.max(m, a.hints_used), 0),
          misconception: "",
        };
      });
      let summary = "";
      try {
        summary = await withLlm(
          llm.creds,
          () => debriefPracticeSet({ lessonTitle: lesson?.title ?? "", problems, results: perProblem }),
          user.language,
        );
      } catch {
        summary = "Session complete. Review the problems you missed and try them again without hints.";
      }
      const score = scoreSet(setId, problems.length);
      finishPracticeSet(setId, summary);
      // practice counts: the section is complete, graded, and enters spaced review
      let enrolled = false;
      if (lesson) {
        setLessonGrade(lesson.id, scoreToLetter(score));
        if (!lesson.completed_at) {
          setLessonCompleted(lesson.id, true);
          enrolled = autoEnrollLesson(lesson.id).enrolled;
        }
      }
      return NextResponse.json({ summary, score, letter: scoreToLetter(score), enrolled, set: setView(setId) });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
