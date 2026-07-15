import { getUserByEmail } from "./repo";
import {
  createAssignment,
  memberRole,
  listMembers,
  listAssignments,
  getAssignment,
  assignmentDetail,
  getOrgByApiKey,
  type Org,
  type Assignment,
  type CurriculumInput,
  type AssignmentProgress,
} from "./org";
import type { LessonKind } from "./repo";

/**
 * Shared assignment-creation logic for every surface a company can drive:
 * the in-app org dashboard, the partner REST API (/api/v1) and MCP (/api/mcp).
 * Companies can author the whole curriculum with any AI model they like and
 * push it in; sections without content stay generatable in-app.
 */

const KINDS: LessonKind[] = ["read", "teach", "practice", "apply", "check", "review"];

/** Resolve the org from a partner request's `Authorization: Bearer abr_org_…`. */
export function orgFromRequest(request: Request): Org | undefined {
  const header = request.headers.get("authorization") ?? "";
  const key = header.replace(/^Bearer\s+/i, "").trim();
  return getOrgByApiKey(key);
}

export type AssignInput = {
  email?: string;
  userId?: number;
  title?: string;
  description?: string;
  note?: string;
  dueAt?: string | null;
  milestones?: unknown;
};

export function buildAssignment(
  org: Org,
  input: AssignInput,
  assignedBy: number | null = null,
): { assignment: Assignment } | { error: string } {
  const employee = input.userId
    ? { id: Number(input.userId) }
    : input.email
      ? getUserByEmail(input.email.toString().trim())
      : undefined;
  if (!employee) return { error: "Employee not found — sign them up to your organization first" };
  if (!memberRole(org.id, employee.id))
    return { error: "That person is not a member of your organization" };

  const title = (input.title ?? "").toString().trim();
  if (!title) return { error: "Assignment title is required" };

  let dueAt: string | null = null;
  if (input.dueAt) {
    const d = new Date(input.dueAt.toString());
    if (Number.isNaN(d.getTime())) return { error: "dueAt must be an ISO date (e.g. 2026-08-01)" };
    dueAt = d.toISOString();
  }

  const curriculum: CurriculumInput = { title, description: (input.description ?? "").toString() };
  if (Array.isArray(input.milestones)) {
    curriculum.milestones = [];
    for (const raw of input.milestones as Record<string, unknown>[]) {
      const mTitle = (raw?.title ?? "").toString().trim();
      if (!mTitle) return { error: "Every milestone needs a title" };
      const lessons = Array.isArray(raw.lessons)
        ? (raw.lessons as Record<string, unknown>[]).map((l) => ({
            title: (l?.title ?? "").toString().trim(),
            objective: (l?.objective ?? "").toString(),
            kind: KINDS.includes(l?.kind as LessonKind) ? (l!.kind as LessonKind) : ("read" as LessonKind),
            content: typeof l?.content === "string" ? l.content : undefined,
          }))
        : [];
      if (lessons.some((l) => !l.title)) return { error: "Every lesson needs a title" };
      curriculum.milestones.push({
        title: mTitle,
        detail: (raw.detail ?? "").toString(),
        estimate: (raw.estimate ?? "").toString(),
        lessons,
      });
    }
  }

  const assignment = createAssignment({
    orgId: org.id,
    userId: employee.id,
    assignedBy,
    note: (input.note ?? "").toString(),
    dueAt,
    curriculum,
  });
  return { assignment };
}

/* ── serializers shared by REST + MCP ──────────────────────── */

export const memberJson = (org: Org) =>
  listMembers(org.id).map((m) => ({
    userId: m.user_id,
    email: m.email,
    name: m.display_name,
    role: m.role,
    joinedAt: m.created_at,
  }));

export const progressJson = (a: AssignmentProgress) => ({
  id: a.id,
  employee: { userId: a.user_id, email: a.employee_email, name: a.employee_name },
  title: a.goal_title,
  note: a.note,
  dueAt: a.due_at,
  status: a.status,
  passedLate: !!a.passed_late,
  completedAt: a.completed_at,
  createdAt: a.created_at,
  progress: {
    sectionsDone: a.sections_done,
    sectionsTotal: a.sections_total,
    readingSec: a.read_sec,
    focusSec: a.focus_sec,
    finalExamBest: a.exam_best,
    finalExamPassed: !!a.exam_passed,
  },
});

export const assignmentsJson = (org: Org) => listAssignments(org.id).map(progressJson);

export function assignmentDetailJson(org: Org, id: number) {
  const a = getAssignment(id);
  if (!a || a.org_id !== org.id) return null;
  const d = assignmentDetail(a);
  return {
    ...progressJson(d.progress),
    sections: d.sections.map((s) => ({
      title: s.title,
      kind: s.kind,
      status: s.status,
      completedAt: s.completed_at,
      grade: s.grade,
      readingSec: s.read_sec,
    })),
    exams: d.exams.map((e) => ({
      kind: e.kind,
      bestScore: e.best_score,
      passed: !!e.passed,
      attempts: e.attempts,
    })),
  };
}
