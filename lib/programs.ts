import { getDb } from "./db";
import { createAssignment, memberRole, hasActiveAssignmentForProgram, type CurriculumInput } from "./org";
import { enqueueTranslation } from "./worker";
import { isSupported } from "./languages";
import type { LessonKind } from "./repo";

/**
 * Programs: reusable, org-owned lesson-plan templates. Authored once in a
 * canonical `source_lang` (in-app via snapshotGoalToProgram, or pushed in via
 * the partner API as a CurriculumInput), then deployed to many employees —
 * where the existing translation engine localizes delivery per employee.
 */

const KINDS: LessonKind[] = ["read", "teach", "practice", "apply", "check", "review"];
const asKind = (k: unknown): LessonKind => (KINDS.includes(k as LessonKind) ? (k as LessonKind) : "read");

export type Program = {
  id: number;
  org_id: number;
  title: string;
  description: string;
  source_lang: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};
export type ProgramLesson = { id: number; title: string; objective: string; kind: LessonKind; content: string };
export type ProgramMilestone = { id: number; title: string; detail: string; estimate: string; lessons: ProgramLesson[] };
export type ProgramFull = Program & { milestones: ProgramMilestone[]; lesson_count: number };

export function getProgram(id: number): Program | undefined {
  return getDb().prepare("SELECT * FROM programs WHERE id = ?").get(id) as Program | undefined;
}

/** Persist a CurriculumInput as a new program (milestones + lessons + any content). */
export function createProgram(
  orgId: number,
  input: CurriculumInput,
  sourceLang: string,
  createdBy: number | null,
): Program {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO programs (org_id, title, description, source_lang, created_by) VALUES (?, ?, ?, ?, ?)")
    .run(orgId, input.title.slice(0, 200), (input.description ?? "").toString(), sourceLang, createdBy);
  const programId = Number(info.lastInsertRowid);
  const insMs = db.prepare(
    "INSERT INTO program_milestones (program_id, order_index, title, detail, estimate) VALUES (?, ?, ?, ?, ?)",
  );
  const insLe = db.prepare(
    "INSERT INTO program_lessons (milestone_id, order_index, title, objective, kind, content) VALUES (?, ?, ?, ?, ?, ?)",
  );
  (input.milestones ?? []).forEach((m, mi) => {
    const msId = Number(insMs.run(programId, mi, m.title, m.detail ?? "", m.estimate ?? "").lastInsertRowid);
    (m.lessons ?? []).forEach((l, li) =>
      insLe.run(msId, li, l.title, l.objective ?? "", asKind(l.kind), l.content ?? ""),
    );
  });
  return getProgram(programId)!;
}

export function getProgramFull(id: number): ProgramFull | undefined {
  const db = getDb();
  const program = getProgram(id);
  if (!program) return undefined;
  const milestones = db
    .prepare("SELECT * FROM program_milestones WHERE program_id = ? ORDER BY order_index, id")
    .all(id) as { id: number; title: string; detail: string; estimate: string }[];
  const lessonStmt = db.prepare(
    "SELECT id, title, objective, kind, content FROM program_lessons WHERE milestone_id = ? ORDER BY order_index, id",
  );
  let lessonCount = 0;
  const full = milestones.map((m) => {
    const lessons = (lessonStmt.all(m.id) as ProgramLesson[]).map((l) => ({ ...l, kind: asKind(l.kind) }));
    lessonCount += lessons.length;
    return { id: m.id, title: m.title, detail: m.detail, estimate: m.estimate, lessons };
  });
  return { ...program, milestones: full, lesson_count: lessonCount };
}

export function listPrograms(orgId: number): (Program & { milestone_count: number; lesson_count: number })[] {
  return getDb()
    .prepare(
      `SELECT p.*,
         (SELECT COUNT(*) FROM program_milestones ms WHERE ms.program_id = p.id) AS milestone_count,
         (SELECT COUNT(*) FROM program_lessons le JOIN program_milestones ms ON ms.id = le.milestone_id
            WHERE ms.program_id = p.id) AS lesson_count
       FROM programs p WHERE p.org_id = ? ORDER BY p.created_at DESC, p.id DESC`,
    )
    .all(orgId) as (Program & { milestone_count: number; lesson_count: number })[];
}

export function deleteProgram(orgId: number, id: number): void {
  // assignments.program_id is ON DELETE SET NULL — employee goals are untouched
  getDb().prepare("DELETE FROM programs WHERE id = ? AND org_id = ?").run(id, orgId);
}

/** Build the CurriculumInput the existing createAssignment consumes, from a stored program. */
export function programToCurriculum(id: number): CurriculumInput | undefined {
  const p = getProgramFull(id);
  if (!p) return undefined;
  return {
    title: p.title,
    description: p.description,
    milestones: p.milestones.map((m) => ({
      title: m.title,
      detail: m.detail,
      estimate: m.estimate,
      lessons: m.lessons.map((l) => ({ title: l.title, objective: l.objective, kind: l.kind, content: l.content })),
    })),
  };
}

/**
 * Snapshot a finished course (goal → latest plan → lessons) into a new program.
 * This is the in-app authoring path: the owner builds a course with the normal
 * goal/plan/lesson pipeline (in their language) and edits it in the course
 * editor, then saves it to the org library. Copies titles/objectives/kinds and
 * whatever generated content exists at snapshot time.
 */
export function snapshotGoalToProgram(
  goalId: number,
  orgId: number,
  sourceLang: string,
  createdBy: number | null,
): Program | { error: string } {
  const db = getDb();
  const goal = db.prepare("SELECT id, title, description FROM goals WHERE id = ?").get(goalId) as
    | { id: number; title: string; description: string }
    | undefined;
  if (!goal) return { error: "Goal not found" };
  const plan = db
    .prepare("SELECT id FROM plans WHERE goal_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(goalId) as { id: number } | undefined;
  if (!plan) return { error: "This goal has no plan yet — generate its plan before saving as a program" };

  const items = db
    .prepare("SELECT id, title, detail, estimate FROM plan_items WHERE plan_id = ? ORDER BY order_index, id")
    .all(plan.id) as { id: number; title: string; detail: string; estimate: string }[];
  const lessonStmt = db.prepare(
    "SELECT title, objective, kind, content FROM lessons WHERE plan_item_id = ? ORDER BY order_index, id",
  );
  const curriculum: CurriculumInput = {
    title: goal.title,
    description: goal.description ?? "",
    milestones: items.map((it) => ({
      title: it.title,
      detail: it.detail,
      estimate: it.estimate,
      lessons: (lessonStmt.all(it.id) as { title: string; objective: string; kind: string; content: string }[]).map(
        (l) => ({ title: l.title, objective: l.objective, kind: asKind(l.kind), content: l.content }),
      ),
    })),
  };
  return createProgram(orgId, curriculum, sourceLang, createdBy);
}

/**
 * Deploy a program to many employees at once. Each employee gets their own copy
 * (a goal under their account) via the existing createAssignment; we stamp
 * program_id for cohort grouping and pre-enqueue a translation of every lesson
 * that has content into the employee's language (skipped when it matches the
 * program's source language). Employees already actively assigned this program
 * are skipped rather than duplicated.
 */
export function deployProgram(input: {
  orgId: number;
  programId: number;
  userIds: number[];
  dueAt?: string | null;
  note?: string;
  assignedBy?: number | null;
}): { deployed: number; skipped: number; results: { userId: number; status: "deployed" | "skipped" | "error"; error?: string }[] } {
  const db = getDb();
  const program = getProgram(input.programId);
  if (!program || program.org_id !== input.orgId)
    return { deployed: 0, skipped: 0, results: input.userIds.map((userId) => ({ userId, status: "error", error: "Program not found" })) };
  const curriculum = programToCurriculum(input.programId)!;
  const results: { userId: number; status: "deployed" | "skipped" | "error"; error?: string }[] = [];
  let deployed = 0;
  let skipped = 0;

  for (const userId of input.userIds) {
    if (!memberRole(input.orgId, userId)) {
      results.push({ userId, status: "error", error: "Not a member of this organization" });
      continue;
    }
    if (hasActiveAssignmentForProgram(input.orgId, userId, input.programId)) {
      skipped++;
      results.push({ userId, status: "skipped" });
      continue;
    }
    const assignment = createAssignment({
      orgId: input.orgId,
      userId,
      assignedBy: input.assignedBy ?? null,
      note: input.note ?? "",
      dueAt: input.dueAt ?? null,
      curriculum,
      programId: input.programId,
    });
    // pre-enqueue translations so content is ready when the employee opens it
    const user = db.prepare("SELECT language FROM users WHERE id = ?").get(userId) as { language: string } | undefined;
    const lang = user?.language ?? "en";
    if (lang !== program.source_lang && isSupported(lang)) {
      const lessons = db
        .prepare(
          `SELECT l.id FROM lessons l JOIN plan_items pi ON pi.id = l.plan_item_id
             JOIN plans p ON p.id = pi.plan_id
           WHERE p.goal_id = ? AND l.content != '' AND l.content IS NOT NULL`,
        )
        .all(assignment.goal_id) as { id: number }[];
      for (const l of lessons) enqueueTranslation("lesson", l.id, lang, userId);
    }
    deployed++;
    results.push({ userId, status: "deployed" });
  }
  return { deployed, skipped, results };
}
