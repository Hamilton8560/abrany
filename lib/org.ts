import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import {
  createGoal,
  createPlan,
  createLessonStubs,
  setLessonContent,
  ensureExams,
  finalPassed,
  getGoal,
  getUserByEmail,
  goalStats,
  displayName,
  type LessonKind,
  type User,
} from "./repo";

/**
 * Organizations (businesses): a company signs its employees up, assigns them
 * education with deadlines, tracks reading time per section, and gets a
 * pass/fail verdict. Companies also get a partner API key that authenticates
 * the REST API (/api/v1) and the MCP endpoint (/api/mcp), so they can author
 * curricula with any AI model they like. Branding (name/logo) white-labels
 * the certificates earned from assigned training.
 */

export type Org = {
  id: number;
  name: string;
  logo: string; // data URL ('' = none)
  tagline: string;
  owner_user_id: number;
  api_key: string;
  created_at: string;
};

export type OrgRole = "admin" | "member";

export type OrgMemberRow = {
  user_id: number;
  role: OrgRole;
  email: string;
  name: string;
  display_name: string;
  created_at: string;
};

export type OrgInvite = { id: number; org_id: number; email: string; role: OrgRole; created_at: string };

export type Assignment = {
  id: number;
  org_id: number;
  user_id: number;
  goal_id: number;
  assigned_by: number | null;
  note: string;
  due_at: string | null;
  status: "assigned" | "in_progress" | "passed" | "failed";
  completed_at: string | null;
  created_at: string;
};

/** An assignment joined with everything a manager needs to see at a glance. */
export type AssignmentProgress = Assignment & {
  goal_title: string;
  employee_email: string;
  employee_name: string;
  sections_total: number;
  sections_done: number;
  read_sec: number; // total seconds spent reading assigned sections
  focus_sec: number; // total focus-timer seconds logged against the goal
  exam_best: number; // best final-exam score (0-100, 0 if none)
  exam_passed: number; // 0/1
  passed_late: number; // 0/1 — passed after the deadline
};

const newApiKey = () => `abr_org_${randomBytes(24).toString("hex")}`;

/* ── org lifecycle ─────────────────────────────────────────── */

export function createOrg(ownerUserId: number, name: string): Org {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO orgs (name, owner_user_id, api_key) VALUES (?, ?, ?)")
    .run(name.slice(0, 80), ownerUserId, newApiKey());
  const orgId = Number(info.lastInsertRowid);
  db.prepare("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'admin')").run(orgId, ownerUserId);
  return getOrg(orgId)!;
}

export function getOrg(id: number): Org | undefined {
  return getDb().prepare("SELECT * FROM orgs WHERE id = ?").get(id) as Org | undefined;
}

export function getOrgByApiKey(key: string): Org | undefined {
  if (!key || !key.startsWith("abr_org_")) return undefined;
  return getDb().prepare("SELECT * FROM orgs WHERE api_key = ?").get(key) as Org | undefined;
}

/** The org this user belongs to (MVP: one org per user), with their role. */
export function orgForUser(userId: number): { org: Org; role: OrgRole } | undefined {
  const row = getDb()
    .prepare(
      `SELECT o.*, m.role AS member_role FROM org_members m JOIN orgs o ON o.id = m.org_id
       WHERE m.user_id = ? ORDER BY m.created_at LIMIT 1`,
    )
    .get(userId) as (Org & { member_role: OrgRole }) | undefined;
  if (!row) return undefined;
  const { member_role, ...org } = row;
  return { org: org as Org, role: member_role };
}

export function updateOrgBranding(
  id: number,
  fields: Partial<Pick<Org, "name" | "logo" | "tagline">>,
): Org | undefined {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.name !== undefined) { sets.push("name = ?"); vals.push(fields.name.slice(0, 80)); }
  if (fields.logo !== undefined) { sets.push("logo = ?"); vals.push(fields.logo); }
  if (fields.tagline !== undefined) { sets.push("tagline = ?"); vals.push(fields.tagline.slice(0, 120)); }
  if (sets.length)
    getDb().prepare(`UPDATE orgs SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as never[]), id);
  return getOrg(id);
}

export function rotateOrgKey(id: number): Org | undefined {
  getDb().prepare("UPDATE orgs SET api_key = ? WHERE id = ?").run(newApiKey(), id);
  return getOrg(id);
}

/* ── membership & invites ──────────────────────────────────── */

export function memberRole(orgId: number, userId: number): OrgRole | undefined {
  const r = getDb()
    .prepare("SELECT role FROM org_members WHERE org_id = ? AND user_id = ?")
    .get(orgId, userId) as { role: OrgRole } | undefined;
  return r?.role;
}

export function listMembers(orgId: number): OrgMemberRow[] {
  const rows = getDb()
    .prepare(
      `SELECT m.user_id, m.role, m.created_at, u.email, u.name FROM org_members m
       JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.role = 'admin' DESC, u.email`,
    )
    .all(orgId) as (Omit<OrgMemberRow, "display_name">)[];
  return rows.map((r) => ({ ...r, display_name: displayName(r) }));
}

export function listInvites(orgId: number): OrgInvite[] {
  return getDb()
    .prepare("SELECT * FROM org_invites WHERE org_id = ? ORDER BY created_at DESC")
    .all(orgId) as OrgInvite[];
}

/**
 * Add someone to the org by email. Existing accounts join immediately;
 * unknown emails get an invite that auto-accepts when they sign up.
 */
export function addMemberByEmail(
  orgId: number,
  email: string,
  role: OrgRole = "member",
): { status: "added" | "invited" | "already" } {
  const db = getDb();
  const user = getUserByEmail(email);
  if (user) {
    if (memberRole(orgId, user.id)) return { status: "already" };
    db.prepare("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)").run(orgId, user.id, role);
    db.prepare("DELETE FROM org_invites WHERE org_id = ? AND email = ?").run(orgId, email.toLowerCase());
    return { status: "added" };
  }
  db.prepare("INSERT OR IGNORE INTO org_invites (org_id, email, role) VALUES (?, ?, ?)").run(
    orgId,
    email.toLowerCase(),
    role,
  );
  return { status: "invited" };
}

export function removeMember(orgId: number, userId: number): void {
  const org = getOrg(orgId);
  if (org && org.owner_user_id === userId) return; // the founder can't be removed
  getDb().prepare("DELETE FROM org_members WHERE org_id = ? AND user_id = ?").run(orgId, userId);
}

export function revokeInvite(orgId: number, inviteId: number): void {
  getDb().prepare("DELETE FROM org_invites WHERE id = ? AND org_id = ?").run(inviteId, orgId);
}

/** Called at signup: any pending invites for this email become memberships. */
export function acceptInvitesForUser(user: Pick<User, "id" | "email">): void {
  const db = getDb();
  const invites = db
    .prepare("SELECT * FROM org_invites WHERE email = ?")
    .all(user.email.toLowerCase()) as OrgInvite[];
  for (const inv of invites) {
    db.prepare("INSERT OR IGNORE INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)").run(
      inv.org_id,
      user.id,
      inv.role,
    );
    db.prepare("DELETE FROM org_invites WHERE id = ?").run(inv.id);
  }
}

/* ── assignments (company → employee education) ────────────── */

/** A full externally-authored curriculum (e.g. from a company's own AI model). */
export type CurriculumInput = {
  title: string;
  description?: string;
  milestones?: {
    title: string;
    detail?: string;
    estimate?: string;
    lessons?: { title: string; objective?: string; kind?: LessonKind; content?: string }[];
  }[];
};

/**
 * Assign education to an employee. Creates the goal under the EMPLOYEE's
 * account (their curriculum, their pace) plus the assignment record the org
 * tracks. When a curriculum is supplied (API/MCP path), the plan, sections and
 * exams are created immediately; sections with content arrive ready to read,
 * the rest can still be generated in-app by the employee's AI.
 */
export function createAssignment(input: {
  orgId: number;
  userId: number;
  assignedBy?: number | null;
  note?: string;
  dueAt?: string | null;
  curriculum: CurriculumInput;
}): Assignment {
  const db = getDb();
  const cur = input.curriculum;
  const goal = createGoal(input.userId, cur.title, cur.description ?? "");
  if (cur.milestones?.length) {
    const plan = createPlan(
      goal.id,
      cur.title,
      cur.description ?? "",
      cur.milestones.map((m) => ({ title: m.title, detail: m.detail, estimate: m.estimate })),
    );
    plan.items.forEach((item, i) => {
      const lessons = cur.milestones![i].lessons ?? [];
      if (!lessons.length) return;
      const created = createLessonStubs(
        item.id,
        lessons.map((l) => ({ title: l.title, objective: l.objective, kind: l.kind })),
      );
      created.forEach((row, j) => {
        const content = lessons[j]?.content;
        if (content && content.trim()) setLessonContent(row.id, content);
      });
    });
    ensureExams(goal.id);
  }
  const info = db
    .prepare(
      "INSERT INTO assignments (org_id, user_id, goal_id, assigned_by, note, due_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(input.orgId, input.userId, goal.id, input.assignedBy ?? null, input.note ?? "", input.dueAt ?? null);
  return getAssignment(Number(info.lastInsertRowid))!;
}

export function getAssignment(id: number): Assignment | undefined {
  return getDb().prepare("SELECT * FROM assignments WHERE id = ?").get(id) as Assignment | undefined;
}

export function deleteAssignment(orgId: number, id: number): void {
  // the goal stays with the employee; only the org's tracking record goes
  getDb().prepare("DELETE FROM assignments WHERE id = ? AND org_id = ?").run(id, orgId);
}

/** The org whose assignment produced this goal (for certificate white-labeling). */
export function orgForGoal(goalId: number): Org | undefined {
  return getDb()
    .prepare(
      "SELECT o.* FROM assignments a JOIN orgs o ON o.id = a.org_id WHERE a.goal_id = ? ORDER BY a.id LIMIT 1",
    )
    .get(goalId) as Org | undefined;
}

/**
 * Recompute an assignment's pass/fail and persist transitions.
 * Pass = the goal's final exam is passed (or the goal was formally completed).
 * Fail = the deadline elapsed without a pass; a later pass still flips it back
 * (passed_late shows it happened after the deadline).
 */
export function refreshAssignmentStatus(a: Assignment): Assignment {
  const db = getDb();
  const goal = getGoal(a.goal_id);
  const passed = !!goal && (goal.status === "done" || finalPassed(a.goal_id));
  let status: Assignment["status"];
  if (passed) status = "passed";
  else if (a.due_at && new Date(a.due_at.replace(" ", "T")).getTime() < Date.now()) status = "failed";
  else {
    const started = db
      .prepare(
        `SELECT 1 FROM lessons l JOIN plan_items pi ON pi.id = l.plan_item_id
         JOIN plans p ON p.id = pi.plan_id
         WHERE p.goal_id = ? AND (l.completed_at IS NOT NULL OR l.read_sec > 0) LIMIT 1`,
      )
      .get(a.goal_id);
    status = started ? "in_progress" : "assigned";
  }
  if (status !== a.status) {
    db.prepare("UPDATE assignments SET status = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?").run(
      status,
      status === "passed" ? new Date().toISOString() : null,
      a.id,
    );
    return getAssignment(a.id)!;
  }
  return a;
}

const progressFor = (a: Assignment): AssignmentProgress => {
  const db = getDb();
  const refreshed = refreshAssignmentStatus(a);
  const goal = getGoal(refreshed.goal_id);
  const employee = db.prepare("SELECT email, name FROM users WHERE id = ?").get(refreshed.user_id) as
    | { email: string; name: string }
    | undefined;
  const stats = goalStats(refreshed.goal_id);
  const read = db
    .prepare(
      `SELECT COALESCE(SUM(l.read_sec),0) n FROM lessons l JOIN plan_items pi ON pi.id = l.plan_item_id
       JOIN plans p ON p.id = pi.plan_id WHERE p.goal_id = ?`,
    )
    .get(refreshed.goal_id) as { n: number };
  const focus = db
    .prepare("SELECT COALESCE(SUM(duration_sec),0) n FROM sessions WHERE goal_id = ? AND mode='focus'")
    .get(refreshed.goal_id) as { n: number };
  const exam = db
    .prepare("SELECT best_score, passed FROM exams WHERE goal_id = ? AND kind = 'final'")
    .get(refreshed.goal_id) as { best_score: number; passed: number } | undefined;
  const passedLate =
    refreshed.status === "passed" &&
    !!refreshed.due_at &&
    !!refreshed.completed_at &&
    new Date(refreshed.completed_at).getTime() > new Date(refreshed.due_at.replace(" ", "T")).getTime();
  return {
    ...refreshed,
    goal_title: goal?.title ?? "(deleted goal)",
    employee_email: employee?.email ?? "",
    employee_name: employee ? displayName({ name: employee.name, email: employee.email }) : "",
    sections_total: stats.sectionsTotal,
    sections_done: stats.sectionsDone,
    read_sec: read.n,
    focus_sec: focus.n,
    exam_best: exam?.best_score ?? 0,
    exam_passed: exam?.passed ?? 0,
    passed_late: passedLate ? 1 : 0,
  };
};

export function listAssignments(orgId: number): AssignmentProgress[] {
  const rows = getDb()
    .prepare("SELECT * FROM assignments WHERE org_id = ? ORDER BY created_at DESC, id DESC")
    .all(orgId) as Assignment[];
  return rows.map(progressFor);
}

/** The employee's view: what their company assigned them, with deadlines. */
export function assignmentsForUser(userId: number): (AssignmentProgress & { org_name: string; org_logo: string })[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM assignments WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId) as Assignment[];
  return rows.map((a) => {
    const org = getOrg(a.org_id);
    return { ...progressFor(a), org_name: org?.name ?? "", org_logo: org?.logo ?? "" };
  });
}

/** Per-section detail for one assignment: what was read, for how long, grades. */
export function assignmentDetail(a: Assignment): {
  progress: AssignmentProgress;
  sections: { title: string; kind: string; status: string; completed_at: string | null; grade: string; read_sec: number }[];
  exams: { kind: string; best_score: number; passed: number; attempts: number }[];
} {
  const db = getDb();
  const sections = db
    .prepare(
      `SELECT l.title, l.kind, l.status, l.completed_at, l.grade, l.read_sec
       FROM lessons l JOIN plan_items pi ON pi.id = l.plan_item_id JOIN plans p ON p.id = pi.plan_id
       WHERE p.goal_id = ? ORDER BY pi.order_index, l.order_index`,
    )
    .all(a.goal_id) as { title: string; kind: string; status: string; completed_at: string | null; grade: string; read_sec: number }[];
  const exams = db
    .prepare("SELECT kind, best_score, passed, attempts FROM exams WHERE goal_id = ?")
    .all(a.goal_id) as { kind: string; best_score: number; passed: number; attempts: number }[];
  return { progress: progressFor(a), sections, exams };
}

/* ── reading time ──────────────────────────────────────────── */

/** Heartbeat: add up to 60s of reading time to a section (clamped per ping). */
export function addLessonReadTime(lessonId: number, sec: number): void {
  const add = Math.max(0, Math.min(60, Math.round(sec)));
  if (!add) return;
  getDb().prepare("UPDATE lessons SET read_sec = read_sec + ? WHERE id = ?").run(add, lessonId);
}
