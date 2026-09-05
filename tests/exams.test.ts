import "./setup.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createUser,
  createGoal,
  createPlan,
  createLessonStubs,
  setLessonContent,
  setLessonCompleted,
  ensureExams,
  examEligibility,
  setExamQuestions,
  getExam,
  examQuestions,
  updatePlanItem,
} from "../lib/repo.ts";

let n = 0;
function course(milestones: number, lessonsEach: number) {
  const u = createUser(`exam${++n}@example.com`, "hash");
  const goal = createGoal(u.id, `Course ${n}`);
  const plan = createPlan(
    goal.id,
    "plan",
    "",
    Array.from({ length: milestones }, (_, i) => ({ title: `M${i + 1}` })),
  );
  const lessons = plan.items.flatMap((it) =>
    createLessonStubs(
      it.id,
      Array.from({ length: lessonsEach }, (_, j) => ({ title: `L${j + 1}` })),
    ),
  );
  for (const l of lessons) setLessonContent(l.id, "body");
  return { goal, plan, lessons };
}

test("final exam unlocks only once every section is complete", () => {
  const { goal, lessons } = course(4, 2);
  const exams = ensureExams(goal.id);
  const final = exams.find((e) => e.kind === "final")!;
  let e = examEligibility(final);
  assert.equal(e.eligible, false);
  assert.equal(e.total, 8);
  assert.equal(e.done, 0);
  for (const l of lessons.slice(0, 7)) setLessonCompleted(l.id, true);
  e = examEligibility(final);
  assert.equal(e.eligible, false);
  assert.equal(e.done, 7);
  setLessonCompleted(lessons[7].id, true);
  assert.equal(examEligibility(final).eligible, true);
});

test("midterm covers the first half of milestones only", () => {
  const { goal, lessons } = course(4, 1);
  const midterm = ensureExams(goal.id).find((e) => e.kind === "midterm")!;
  setLessonCompleted(lessons[0].id, true);
  setLessonCompleted(lessons[1].id, true);
  const e = examEligibility(midterm);
  assert.equal(e.total, 2);
  assert.equal(e.eligible, true);
});

test("an unexpanded milestone counts as a unit, done when checked", () => {
  const u = createUser(`exam${++n}@example.com`, "hash");
  const goal = createGoal(u.id, "Legacy");
  const plan = createPlan(goal.id, "plan", "", [{ title: "A" }, { title: "B" }]);
  const final = ensureExams(goal.id).find((e) => e.kind === "final")!;
  assert.equal(examEligibility(final).eligible, false);
  updatePlanItem(plan.items[0].id, "done");
  updatePlanItem(plan.items[1].id, "done");
  assert.equal(examEligibility(final).eligible, true);
});

test("exam questions are persisted server-side", () => {
  const { goal } = course(1, 1);
  const final = ensureExams(goal.id).find((e) => e.kind === "final")!;
  assert.deepEqual(examQuestions(getExam(final.id)!), []);
  setExamQuestions(final.id, ["What is X?", "Explain Y."]);
  assert.deepEqual(examQuestions(getExam(final.id)!), ["What is X?", "Explain Y."]);
});
