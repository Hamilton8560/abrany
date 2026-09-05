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
  goalStats,
  getGoal,
  findActiveJob,
  listLessons,
  getPlanForGoal,
} from "../lib/repo.ts";
import { createOrg, addMemberByEmail, createAssignment, listAssignments, assignmentForGoal, normalizeDueAt } from "../lib/org.ts";
import { getUserByEmail } from "../lib/repo.ts";

let n = 0;
async function orgWithEmployee() {
  const owner = createUser(`boss${++n}@example.com`, "hash", true);
  const org = createOrg(owner.id, `Org ${n}`);
  await addMemberByEmail(org.id, `emp${n}@example.com`);
  const emp = getUserByEmail(`emp${n}@example.com`)!;
  return { owner, org, emp };
}

test("goalStats only counts the LATEST plan after a rebuild", () => {
  const u = createUser(`stats${++n}@example.com`, "hash");
  const goal = createGoal(u.id, "Rebuilt goal");
  const p1 = createPlan(goal.id, "v1", "", [{ title: "Old milestone" }]);
  const [old] = createLessonStubs(p1.items[0].id, [{ title: "Old lesson" }]);
  setLessonContent(old.id, "body");
  setLessonCompleted(old.id, true);
  const p2 = createPlan(goal.id, "v2", "", [{ title: "New milestone" }]);
  createLessonStubs(p2.items[0].id, [{ title: "New A" }, { title: "New B" }]);
  const s = goalStats(goal.id);
  assert.equal(s.sectionsTotal, 2, "old plan's lesson must not be counted");
  assert.equal(s.sectionsDone, 0);
});

test("assigning without a curriculum queues a background course build", async () => {
  const { org, emp, owner } = await orgWithEmployee();
  const a = createAssignment({
    orgId: org.id,
    userId: emp.id,
    assignedBy: owner.id,
    curriculum: { title: "OSHA 10 refresher", description: "Site safety basics" },
    dueAt: normalizeDueAt("2030-01-15"),
  });
  const goal = getGoal(a.goal_id)!;
  assert.equal(goal.build_status, "queued");
  assert.ok(findActiveJob(`course:${goal.id}`), "a build_course job is waiting");
  assert.equal(a.due_at, "2030-01-15T23:59:59.000Z", "bare dates become end-of-day deadlines");
  const rows = listAssignments(org.id);
  assert.equal(rows[0].goal_title, "OSHA 10 refresher");
  assert.equal(rows[0].status, "assigned");
});

test("assigning a curriculum with content-less lessons queues their generation", async () => {
  const { org, emp } = await orgWithEmployee();
  const a = createAssignment({
    orgId: org.id,
    userId: emp.id,
    curriculum: {
      title: "Forklift",
      milestones: [
        {
          title: "Pre-op",
          lessons: [
            { title: "Walkaround", content: "# Ready content" },
            { title: "Fluids check" },
          ],
        },
      ],
    },
  });
  const plan = getPlanForGoal(a.goal_id)!;
  const lessons = listLessons(plan.items[0].id);
  assert.equal(lessons[0].status, "ready");
  assert.equal(lessons[1].status, "queued");
  assert.ok(findActiveJob(`lesson:${lessons[1].id}`));
  assert.equal(getGoal(a.goal_id)!.build_status, "", "a supplied curriculum needs no plan build");
});

test("assignmentForGoal exposes the org that locked the course", async () => {
  const { org, emp } = await orgWithEmployee();
  const a = createAssignment({ orgId: org.id, userId: emp.id, curriculum: { title: "Locked" } });
  const info = assignmentForGoal(a.goal_id);
  assert.equal(info?.org_name, org.name);
  assert.equal(assignmentForGoal(999_999), undefined);
});

test("normalizeDueAt accepts ISO timestamps and rejects junk", () => {
  assert.equal(normalizeDueAt("2030-02-01T10:00:00.000Z"), "2030-02-01T10:00:00.000Z");
  assert.equal(normalizeDueAt(""), null);
  assert.equal(normalizeDueAt("not a date"), undefined);
});
