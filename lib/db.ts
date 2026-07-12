import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * SQLite via Node's built-in `node:sqlite` (Node 22.5+; no native dep).
 * A single connection is cached on globalThis so Next.js hot-reloads in dev
 * don't open a new handle on every module re-evaluation.
 */

const DB_DIR = join(process.cwd(), ".data");
const DB_PATH = join(DB_DIR, "abrany.db");

type Global = typeof globalThis & { __abranyDb?: DatabaseSync };
const g = globalThis as Global;

function migrate(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS goals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'active',   -- active | done | archived
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      summary    TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plan_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      detail      TEXT NOT NULL DEFAULT '',
      estimate    TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'todo'      -- todo | doing | done
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id     INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      mode        TEXT NOT NULL DEFAULT 'focus',    -- focus | break
      started_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      notes       TEXT NOT NULL DEFAULT '',
      tags        TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS threads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id    INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      title      TEXT NOT NULL DEFAULT 'New conversation',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,                     -- user | assistant
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_plans_goal    ON plans(goal_id);
    CREATE INDEX IF NOT EXISTS idx_items_plan    ON plan_items(plan_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_goal ON sessions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_messages_thr  ON messages(thread_id);
  `);
}

export function getDb(): DatabaseSync {
  if (g.__abranyDb) return g.__abranyDb;
  mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  migrate(db);
  g.__abranyDb = db;
  return db;
}
