import { getDb } from "./db";
import { displayName } from "./repo";

/**
 * Community forums: seeded categories along two axes (age group + learning
 * interest), threads and replies. Authors and the app owner can delete.
 */

export type Forum = {
  id: number;
  slug: string;
  kind: "age" | "interest";
  title: string;
  description: string;
  order_index: number;
};

export type ForumWithStats = Forum & { threads: number; posts: number; last_activity: string | null };

export type ThreadRow = {
  id: number;
  forum_id: number;
  user_id: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: string;
  replies: number;
};

export type PostRow = {
  id: number;
  thread_id: number;
  user_id: number;
  body: string;
  created_at: string;
  author: string;
};

const authorName = (userId: number): string => {
  const u = getDb().prepare("SELECT email, name FROM users WHERE id = ?").get(userId) as
    | { email: string; name: string }
    | undefined;
  return u ? displayName(u) : "Former member";
};

export function listForums(): ForumWithStats[] {
  const rows = getDb()
    .prepare(
      `SELECT f.*,
         (SELECT COUNT(*) FROM forum_threads t WHERE t.forum_id = f.id) threads,
         (SELECT COUNT(*) FROM forum_posts p JOIN forum_threads t ON t.id = p.thread_id WHERE t.forum_id = f.id) posts,
         (SELECT MAX(t.updated_at) FROM forum_threads t WHERE t.forum_id = f.id) last_activity
       FROM forums f ORDER BY f.order_index, f.id`,
    )
    .all() as ForumWithStats[];
  return rows;
}

export function getForumBySlug(slug: string): Forum | undefined {
  return getDb().prepare("SELECT * FROM forums WHERE slug = ?").get(slug) as Forum | undefined;
}

export function listThreads(forumId: number): ThreadRow[] {
  const rows = getDb()
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id = t.id) replies
       FROM forum_threads t WHERE t.forum_id = ? ORDER BY t.updated_at DESC LIMIT 100`,
    )
    .all(forumId) as (Omit<ThreadRow, "author">)[];
  return rows.map((t) => ({ ...t, author: authorName(t.user_id) }));
}

export function createThread(forumId: number, userId: number, title: string, body: string): number {
  const info = getDb()
    .prepare("INSERT INTO forum_threads (forum_id, user_id, title, body) VALUES (?, ?, ?, ?)")
    .run(forumId, userId, title.trim().slice(0, 180), body.slice(0, 8000));
  return Number(info.lastInsertRowid);
}

export function getThread(id: number): (ThreadRow & { forum: Forum; postRows: PostRow[] }) | undefined {
  const db = getDb();
  const t = db.prepare("SELECT * FROM forum_threads WHERE id = ?").get(id) as
    | Omit<ThreadRow, "author" | "replies">
    | undefined;
  if (!t) return undefined;
  const forum = db.prepare("SELECT * FROM forums WHERE id = ?").get(t.forum_id) as Forum;
  const posts = db
    .prepare("SELECT * FROM forum_posts WHERE thread_id = ? ORDER BY id")
    .all(id) as Omit<PostRow, "author">[];
  return {
    ...t,
    author: authorName(t.user_id),
    replies: posts.length,
    forum,
    postRows: posts.map((p) => ({ ...p, author: authorName(p.user_id) })),
  };
}

export function addPost(threadId: number, userId: number, body: string): void {
  const db = getDb();
  db.prepare("INSERT INTO forum_posts (thread_id, user_id, body) VALUES (?, ?, ?)").run(
    threadId,
    userId,
    body.slice(0, 8000),
  );
  db.prepare("UPDATE forum_threads SET updated_at = datetime('now') WHERE id = ?").run(threadId);
}

/** Delete a thread if the requester wrote it (or is the app owner). */
export function deleteThread(id: number, userId: number, isOwner: boolean): boolean {
  const res = getDb()
    .prepare(`DELETE FROM forum_threads WHERE id = ? ${isOwner ? "" : "AND user_id = ?"}`)
    .run(...(isOwner ? [id] : [id, userId]));
  return Number(res.changes) > 0;
}

export function deletePost(id: number, userId: number, isOwner: boolean): boolean {
  const res = getDb()
    .prepare(`DELETE FROM forum_posts WHERE id = ? ${isOwner ? "" : "AND user_id = ?"}`)
    .run(...(isOwner ? [id] : [id, userId]));
  return Number(res.changes) > 0;
}
