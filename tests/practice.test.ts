import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedReadyLesson } from "./helpers/fixtures.ts";
import {
  createPracticeSet,
  latestPracticeSet,
  addAttempt,
  outcomes,
  scoreSet,
  insertProblem,
  listAttempts,
  finishPracticeSet,
  parseProblems,
  type Problem,
} from "../lib/practice.ts";
import { stripLeadingH1 } from "../lib/repo.ts";

const prob = (prompt: string, difficulty: Problem["difficulty"] = "core"): Problem => ({
  prompt,
  kind: "short",
  difficulty,
  starter: "",
  hints: ["h1", "h2", "h3"],
  solution: "the answer",
  rubric: "must say the answer",
  answerFormat: "one line",
});

test("a set is created, found as latest, and scored from best attempts", () => {
  const { lesson, userId } = seedReadyLesson();
  const set = createPracticeSet(lesson.id, userId, [prob("a", "warmup"), prob("b"), prob("c", "stretch")]);
  assert.equal(latestPracticeSet(lesson.id, userId)?.id, set.id);
  addAttempt({ setId: set.id, problemIndex: 0, answer: "x", verdict: "incorrect", feedback: "", hintsUsed: 1 });
  addAttempt({ setId: set.id, problemIndex: 0, answer: "y", verdict: "correct", feedback: "", hintsUsed: 2 });
  addAttempt({ setId: set.id, problemIndex: 1, answer: "z", verdict: "partial", feedback: "", hintsUsed: 0 });
  assert.deepEqual(outcomes(set.id, 3), ["correct", "partial", null]);
  assert.equal(scoreSet(set.id, 3), 50);
});

test("inserting an easier variant shifts later attempts", () => {
  const { lesson, userId } = seedReadyLesson();
  const set = createPracticeSet(lesson.id, userId, [prob("a"), prob("b"), prob("c")]);
  addAttempt({ setId: set.id, problemIndex: 2, answer: "", verdict: "revealed", feedback: "", hintsUsed: 3 });
  const at = insertProblem(set.id, 0, prob("a-easier", "warmup"));
  assert.equal(at, 1);
  assert.deepEqual(parseProblems(latestPracticeSet(lesson.id, userId)!).map((p) => p.prompt), ["a", "a-easier", "b", "c"]);
  assert.equal(listAttempts(set.id)[0].problem_index, 3, "the revealed attempt now points at 'c'");
});

test("finishing stores the debrief and flips status", () => {
  const { lesson, userId } = seedReadyLesson();
  const set = createPracticeSet(lesson.id, userId, [prob("a")]);
  const done = finishPracticeSet(set.id, "Nice work.");
  assert.equal(done.status, "done");
  assert.equal(done.summary, "Nice work.");
});

test("stripLeadingH1 removes only a leading title line", () => {
  assert.equal(stripLeadingH1("# Title\n\nBody\n## H2"), "Body\n## H2");
  assert.equal(stripLeadingH1("Body first\n# Not a title"), "Body first\n# Not a title");
});
