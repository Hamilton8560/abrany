import { getDb } from "./db";
import { displayName, ensureExams, getGoal, getPlanForGoal } from "./repo";

/**
 * Course marketplace: publishing makes one of your courses (a goal with a plan)
 * publicly listed in-app; cloning deep-copies the current plan, milestones and
 * sections — generated content included — into the cloner's own goals with all
 * progress reset. The listing keeps pointing at the author's live course.
 */

export const AGE_GROUPS = ["kids", "teens", "adults", "seniors", "all"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export type CourseListing = {
  id: number;
  goal_id: number;
  owner_user_id: number;
  title: string;
  blurb: string;
  tags: string;
  age_group: AgeGroup;
  clones: number;
  created_at: string;
  updated_at: string;
};

export type MarketListing = CourseListing & {
  author: string;
  plan_version: number;
  milestones: number;
  sections: number;
  ready_sections: number;
  total_hours: number;
};

export function getListing(id: number): CourseListing | undefined {
  return getDb().prepare("SELECT * FROM course_listings WHERE id = ?").get(id) as CourseListing | undefined;
}

export function getListingForGoal(goalId: number): CourseListing | undefined {
  return getDb().prepare("SELECT * FROM course_listings WHERE goal_id = ?").get(goalId) as
    | CourseListing
    | undefined;
}

/** Publish (or update the listing of) one of your courses. */
export function publishCourse(
  userId: number,
  goalId: number,
  meta: { blurb?: string; tags?: string; ageGroup?: string },
): CourseListing {
  const goal = getGoal(goalId)!;
  const age = (AGE_GROUPS as readonly string[]).includes(meta.ageGroup ?? "") ? meta.ageGroup! : "adults";
  getDb()
    .prepare(
      `INSERT INTO course_listings (goal_id, owner_user_id, title, blurb, tags, age_group)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(goal_id) DO UPDATE SET
         title = excluded.title, blurb = excluded.blurb, tags = excluded.tags,
         age_group = excluded.age_group, updated_at = datetime('now')`,
    )
    .run(
      goalId,
      userId,
      goal.title.slice(0, 160),
      (meta.blurb ?? "").slice(0, 500),
      (meta.tags ?? "").slice(0, 200),
      age,
    );
  return getListingForGoal(goalId)!;
}

export function unpublishCourse(userId: number, listingId: number): void {
  getDb().prepare("DELETE FROM course_listings WHERE id = ? AND owner_user_id = ?").run(listingId, userId);
}

const listingStats = (l: CourseListing): MarketListing => {
  const db = getDb();
  const author = db.prepare("SELECT email, name FROM users WHERE id = ?").get(l.owner_user_id) as
    | { email: string; name: string }
    | undefined;
  const plan = db
    .prepare("SELECT id, version FROM plans WHERE goal_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(l.goal_id) as { id: number; version: number } | undefined;
  const items = plan
    ? (db
        .prepare("SELECT COUNT(*) m, COALESCE(SUM(hours), 0) h FROM plan_items WHERE plan_id = ?")
        .get(plan.id) as { m: number; h: number })
    : { m: 0, h: 0 };
  const lessons = plan
    ? (db
        .prepare(
          `SELECT COUNT(*) s, COALESCE(SUM(CASE WHEN l.status = 'ready' THEN 1 ELSE 0 END), 0) r
           FROM lessons l JOIN plan_items pi ON pi.id = l.plan_item_id WHERE pi.plan_id = ?`,
        )
        .get(plan.id) as { s: number; r: number })
    : { s: 0, r: 0 };
  const counts = { m: items.m, s: lessons.s, r: lessons.r, h: items.h };
  return {
    ...l,
    author: author ? displayName(author) : "Unknown",
    plan_version: plan?.version ?? 1,
    milestones: counts.m,
    sections: counts.s,
    ready_sections: counts.r,
    total_hours: Math.round(counts.h),
  };
};

export function browseMarket(filter: { ageGroup?: string; q?: string } = {}): MarketListing[] {
  const db = getDb();
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (filter.ageGroup && (AGE_GROUPS as readonly string[]).includes(filter.ageGroup)) {
    conds.push("(age_group = ? OR age_group = 'all')");
    vals.push(filter.ageGroup);
  }
  if (filter.q && filter.q.trim()) {
    conds.push("(title LIKE ? OR blurb LIKE ? OR tags LIKE ?)");
    const like = `%${filter.q.trim()}%`;
    vals.push(like, like, like);
  }
  const rows = db
    .prepare(
      `SELECT * FROM course_listings ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
       ORDER BY clones DESC, created_at DESC LIMIT 100`,
    )
    .all(...(vals as never[])) as CourseListing[];
  return rows.map(listingStats);
}

export function myListings(userId: number): MarketListing[] {
  const rows = getDb()
    .prepare("SELECT * FROM course_listings WHERE owner_user_id = ? ORDER BY created_at DESC")
    .all(userId) as CourseListing[];
  return rows.map(listingStats);
}

/**
 * Deep-copy a published course into the cloner's goals: latest plan, milestones
 * (order, outcomes, hours, difficulty) and sections with generated content —
 * all progress (completion, grades, SRS, reading time) reset. Exams are
 * re-created fresh so the cloner earns their own certificate.
 */
export function cloneCourse(listingId: number, userId: number): { goalId: number } | { error: string } {
  const db = getDb();
  const listing = getListing(listingId);
  if (!listing) return { error: "Listing not found" };
  const srcGoal = getGoal(listing.goal_id);
  const srcPlan = getPlanForGoal(listing.goal_id);
  if (!srcGoal || !srcPlan || !srcPlan.items.length) return { error: "This course has no plan to copy" };

  const goalInfo = db
    .prepare("INSERT INTO goals (user_id, title, description) VALUES (?, ?, ?)")
    .run(userId, srcGoal.title, srcGoal.description);
  const goalId = Number(goalInfo.lastInsertRowid);
  const planInfo = db
    .prepare("INSERT INTO plans (goal_id, title, summary, version, intake) VALUES (?, ?, ?, ?, ?)")
    .run(goalId, srcPlan.title, srcPlan.summary, srcPlan.version, srcPlan.intake);
  const planId = Number(planInfo.lastInsertRowid);

  const insItem = db.prepare(
    "INSERT INTO plan_items (plan_id, title, detail, estimate, order_index, outcomes, hours, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insLesson = db.prepare(
    `INSERT INTO lessons (plan_item_id, title, objective, kind, order_index, status, content, needs_current, sources)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const srcLessons = db.prepare("SELECT * FROM lessons WHERE plan_item_id = ? ORDER BY order_index, id");

  for (const item of srcPlan.items) {
    const itemInfo = insItem.run(
      planId,
      item.title,
      item.detail,
      item.estimate,
      item.order_index,
      item.outcomes ?? "[]",
      item.hours ?? 0,
      item.difficulty ?? "",
    );
    const newItemId = Number(itemInfo.lastInsertRowid);
    const lessons = srcLessons.all(item.id) as {
      title: string;
      objective: string;
      kind: string;
      order_index: number;
      status: string;
      content: string;
      needs_current: number;
      sources: string;
    }[];
    for (const l of lessons) {
      insLesson.run(
        newItemId,
        l.title,
        l.objective,
        l.kind,
        l.order_index,
        l.status === "ready" && l.content ? "ready" : "stub",
        l.status === "ready" ? l.content : "",
        l.needs_current,
        l.sources,
      );
    }
  }

  ensureExams(goalId);
  db.prepare("UPDATE course_listings SET clones = clones + 1 WHERE id = ?").run(listingId);
  return { goalId };
}
