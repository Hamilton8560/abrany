import { getDb } from "./db";

/**
 * Interactive practice: a generated, PROGRESSIVE problem set for a lesson (warm-up →
 * core → stretch) the learner works one problem at a time — with a hint ladder, an AI
 * check of each attempt, a reveal, "give me an easier one", and a debrief at the end.
 * This is the "do problems, get hints, debrief" loop that static practice markdown
 * can't give you (code, math, drills of any kind).
 */

export type ProblemKind = "short" | "code" | "numeric" | "explain";
export type Difficulty = "warmup" | "core" | "stretch";

export type Problem = {
  prompt: string; // markdown
  kind: ProblemKind;
  difficulty: Difficulty;
  starter: string; // starter code / template ('' when none)
  hints: string[]; // 3 rungs: nudge → strategy → next concrete step
  solution: string; // full worked solution (markdown)
  rubric: string; // what a correct answer must contain (for the grader)
  answerFormat: string; // e.g. "a number with units", "a Python function", "2-3 sentences"
};

export type PracticeSet = {
  id: number;
  lesson_id: number;
  user_id: number;
  status: "ready" | "done";
  problems: string; // JSON Problem[]
  summary: string;
  created_at: string;
  updated_at: string;
};

export type PracticeAttempt = {
  id: number;
  set_id: number;
  problem_index: number;
  answer: string;
  verdict: "correct" | "partial" | "incorrect" | "revealed";
  feedback: string;
  hints_used: number;
  created_at: string;
};

export function parseProblems(set: PracticeSet): Problem[] {
  try {
    const arr = JSON.parse(set.problems || "[]");
    return Array.isArray(arr) ? (arr as Problem[]) : [];
  } catch {
    return [];
  }
}

export function createPracticeSet(lessonId: number, userId: number, problems: Problem[]): PracticeSet {
  const info = getDb()
    .prepare("INSERT INTO practice_sets (lesson_id, user_id, problems) VALUES (?, ?, ?)")
    .run(lessonId, userId, JSON.stringify(problems));
  return getPracticeSet(Number(info.lastInsertRowid))!;
}

export function getPracticeSet(id: number): PracticeSet | undefined {
  return getDb().prepare("SELECT * FROM practice_sets WHERE id = ?").get(id) as PracticeSet | undefined;
}

/** The learner's most recent set for a lesson (any status). */
export function latestPracticeSet(lessonId: number, userId: number): PracticeSet | undefined {
  return getDb()
    .prepare("SELECT * FROM practice_sets WHERE lesson_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1")
    .get(lessonId, userId) as PracticeSet | undefined;
}

export function userOwnsPracticeSet(userId: number, setId: number): boolean {
  return !!getDb().prepare("SELECT 1 FROM practice_sets WHERE id = ? AND user_id = ?").get(setId, userId);
}

/** Insert a problem right after `afterIndex` (an easier variant, or a follow-up). Returns its index. */
export function insertProblem(setId: number, afterIndex: number, problem: Problem): number {
  const set = getPracticeSet(setId)!;
  const problems = parseProblems(set);
  const at = Math.min(problems.length, Math.max(0, afterIndex + 1));
  problems.splice(at, 0, problem);
  getDb()
    .prepare("UPDATE practice_sets SET problems = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(problems), setId);
  // attempts at or beyond the insertion point shift by one
  getDb()
    .prepare("UPDATE practice_attempts SET problem_index = problem_index + 1 WHERE set_id = ? AND problem_index >= ?")
    .run(setId, at);
  return at;
}

export function addAttempt(args: {
  setId: number;
  problemIndex: number;
  answer: string;
  verdict: PracticeAttempt["verdict"];
  feedback: string;
  hintsUsed: number;
}): PracticeAttempt {
  const info = getDb()
    .prepare(
      "INSERT INTO practice_attempts (set_id, problem_index, answer, verdict, feedback, hints_used) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(args.setId, args.problemIndex, args.answer.slice(0, 20000), args.verdict, args.feedback.slice(0, 2000), args.hintsUsed);
  return getDb().prepare("SELECT * FROM practice_attempts WHERE id = ?").get(Number(info.lastInsertRowid)) as PracticeAttempt;
}

export function listAttempts(setId: number): PracticeAttempt[] {
  return getDb().prepare("SELECT * FROM practice_attempts WHERE set_id = ? ORDER BY id").all(setId) as PracticeAttempt[];
}

/** Best outcome per problem index: correct > partial > revealed > incorrect > (none). */
export function outcomes(setId: number, count: number): (PracticeAttempt["verdict"] | null)[] {
  const rank: Record<string, number> = { correct: 4, partial: 3, revealed: 2, incorrect: 1 };
  const best: (PracticeAttempt["verdict"] | null)[] = Array.from({ length: count }, () => null);
  for (const a of listAttempts(setId)) {
    if (a.problem_index >= count) continue;
    const cur = best[a.problem_index];
    if (!cur || rank[a.verdict] > rank[cur]) best[a.problem_index] = a.verdict;
  }
  return best;
}

export function finishPracticeSet(setId: number, summary: string): PracticeSet {
  getDb()
    .prepare("UPDATE practice_sets SET status = 'done', summary = ?, updated_at = datetime('now') WHERE id = ?")
    .run(summary, setId);
  return getPracticeSet(setId)!;
}

/** 0-100 score for a set: correct = 1, partial = 0.5, revealed/incorrect/unattempted = 0. */
export function scoreSet(setId: number, count: number): number {
  const o = outcomes(setId, count);
  if (!count) return 0;
  const pts = o.reduce((s, v) => s + (v === "correct" ? 1 : v === "partial" ? 0.5 : 0), 0);
  return Math.round((pts / count) * 100);
}

/** Client-safe view of a set: prompts WITHOUT solutions/hints (revealed per problem, on request). */
export function practiceSetView(setId: number) {
  const set = getPracticeSet(setId)!;
  const problems = parseProblems(set);
  return {
    id: set.id,
    status: set.status,
    summary: set.summary,
    problems: problems.map((p) => ({
      prompt: p.prompt,
      kind: p.kind,
      difficulty: p.difficulty,
      starter: p.starter,
      answerFormat: p.answerFormat,
      hintCount: p.hints.length,
    })),
    attempts: listAttempts(set.id).map((a) => ({
      index: a.problem_index,
      answer: a.answer,
      verdict: a.verdict,
      feedback: a.feedback,
      hintsUsed: a.hints_used,
    })),
    outcomes: outcomes(set.id, problems.length),
  };
}
