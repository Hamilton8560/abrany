import { getUserByEmail } from "./repo";
import {
  createAssignment,
  normalizeDueAt,
  memberRole,
  listMembers,
  listAssignments,
  listSessionDays,
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

/**
 * Resolve the org from a partner request. Preferred: `Authorization: Bearer abr_org_…`.
 * Also accepts the key embedded in the URL — `/api/mcp/abr_org_…` or `?key=abr_org_…`
 * — so MCP connectors that only let you paste a URL (Claude Desktop / claude.ai
 * custom connectors) can still authenticate.
 */
export function orgFromRequest(request: Request): Org | undefined {
  const header = request.headers.get("authorization") ?? "";
  let key = header.replace(/^Bearer\s+/i, "").trim();
  if (!key) {
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get("key")?.trim();
    const fromPath = url.pathname.match(/\/api\/mcp\/([^/?#]+)/)?.[1];
    key = (fromQuery || (fromPath ? decodeURIComponent(fromPath) : "")).trim();
  }
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

  const dueAt = normalizeDueAt(input.dueAt);
  if (dueAt === undefined) return { error: "dueAt must be an ISO date (e.g. 2026-08-01)" };

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

/** Strict YYYY-MM-DD calendar date (rejects 2026-13-01 and friends). */
const isDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  // out-of-range components (month 13, day 32) parse to NaN; rollovers (2026-02-30)
  // parse fine but land on a different day than the one asked for
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

const MAX_RANGE_DAYS = 366;

/**
 * Validate the `from`/`to` query params of GET /api/v1/sessions. Both are required,
 * inclusive, UTC calendar days; the range is capped at 366 days.
 */
export function parseDateRange(url: string): { from: string; to: string } | { error: string } {
  const q = new URL(url).searchParams;
  const from = (q.get("from") ?? "").trim();
  const to = (q.get("to") ?? "").trim();
  if (!isDay(from) || !isDay(to))
    return { error: "from and to are required as ISO dates (e.g. 2026-08-01)" };
  if (from > to) return { error: "from must be on or before to" };
  // from..to inclusive, so the span in midnight steps may be at most MAX_RANGE_DAYS - 1
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days >= MAX_RANGE_DAYS) return { error: `Keep the range to ${MAX_RANGE_DAYS} days or fewer` };
  return { from, to };
}

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
  // '' once the course exists; queued|building while the AI is still writing it; error if it failed
  courseBuild: a.build_status,
  courseBuildError: a.build_error,
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

/**
 * Per member per calendar day (UTC): `pomodoros` = completed focus sessions of 25+
 * minutes, `focusSec` = all focus seconds that day. Only member-days with at least
 * one logged focus session appear — absence of a row means zero.
 */
export const sessionDaysJson = (org: Org, from: string, to: string) =>
  listSessionDays(org.id, from, to).map((d) => ({
    email: d.email,
    date: d.day,
    pomodoros: d.pomodoros,
    focusSec: d.focus_sec,
  }));

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
