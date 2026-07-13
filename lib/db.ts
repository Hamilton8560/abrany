import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * SQLite via Node's built-in `node:sqlite` (Node 22.5+; no native dep).
 * A single connection is cached on globalThis so Next.js hot-reloads in dev
 * don't open a new handle on every module re-evaluation.
 */

// DATA_DIR lets a host mount a persistent volume (e.g. /data) for the SQLite file.
const DB_DIR = process.env.DATA_DIR || join(process.cwd(), ".data");
const DB_PATH = join(DB_DIR, "abrany.db");

type Global = typeof globalThis & { __abranyDb?: DatabaseSync };
const g = globalThis as Global;

function migrate(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_owner      INTEGER NOT NULL DEFAULT 0,
      ai_provider   TEXT NOT NULL DEFAULT '',  -- minimax|kimi|deepseek|openrouter (Phase 3)
      ai_key        TEXT NOT NULL DEFAULT '',
      ai_model      TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

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

    -- one live focus timer per user, so it syncs across every device they use
    CREATE TABLE IF NOT EXISTS timer_states (
      user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mode        TEXT NOT NULL DEFAULT 'focus',   -- focus | break
      focus_min   INTEGER NOT NULL DEFAULT 25,
      break_min   INTEGER NOT NULL DEFAULT 5,
      running     INTEGER NOT NULL DEFAULT 0,
      end_at      INTEGER,                          -- epoch ms the running block ends
      left_sec    INTEGER NOT NULL DEFAULT 1500,    -- remaining secs while paused
      focus_accum INTEGER NOT NULL DEFAULT 0,       -- banked focus seconds
      focus_start INTEGER,                          -- epoch ms current focus segment began
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- generated learning content: a milestone (plan_item) expands into lessons
    CREATE TABLE IF NOT EXISTS lessons (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_item_id  INTEGER NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      objective     TEXT NOT NULL DEFAULT '',
      kind          TEXT NOT NULL DEFAULT 'reading',  -- reading|vocab|practice|quiz|lecture
      order_index   INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'stub',      -- stub|queued|generating|ready|error
      content       TEXT NOT NULL DEFAULT '',
      error         TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- AI-generated slide decks (markdown, slides split on '---')
    CREATE TABLE IF NOT EXISTS presentations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id    INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      title      TEXT NOT NULL,
      topic      TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'generating', -- generating|ready|error
      error      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- long-form books: outline of chapters, each generated independently
    CREATE TABLE IF NOT EXISTS books (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      brief      TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'outlining', -- outlining|ready|error
      error      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      summary     TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'stub',       -- stub|queued|generating|ready|error
      content     TEXT NOT NULL DEFAULT '',
      error       TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);

    -- midterm + final exams that gate course completion (each with a study guide)
    CREATE TABLE IF NOT EXISTS exams (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id     INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,                       -- midterm | final
      title       TEXT NOT NULL,
      study_guide TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'stub',         -- stub|generating|ready|error
      best_score  INTEGER NOT NULL DEFAULT 0,           -- 0-100
      passed      INTEGER NOT NULL DEFAULT 0,
      attempts    INTEGER NOT NULL DEFAULT 0,
      error       TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(goal_id, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_exams_goal ON exams(goal_id);

    -- issued completion credentials (certificate + transcript, publicly verifiable)
    CREATE TABLE IF NOT EXISTS certificates (
      id             TEXT PRIMARY KEY,               -- e.g. ABR-2026-8F3A21
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      goal_id        INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      recipient_name TEXT NOT NULL,                  -- snapshot at issue time
      title          TEXT NOT NULL,                  -- the achievement (goal title)
      sections_total INTEGER NOT NULL DEFAULT 0,
      sections_done  INTEGER NOT NULL DEFAULT 0,
      minutes_total  INTEGER NOT NULL DEFAULT 0,
      overall        TEXT NOT NULL DEFAULT '',       -- overall grade/label snapshot
      issued_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cert_user ON certificates(user_id);
    CREATE INDEX IF NOT EXISTS idx_cert_goal ON certificates(goal_id);

    -- durable async job queue drained by the background worker
    CREATE TABLE IF NOT EXISTS jobs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,                        -- generate_lesson | ...
      payload    TEXT NOT NULL DEFAULT '{}',
      status     TEXT NOT NULL DEFAULT 'queued',       -- queued|running|done|error
      attempts   INTEGER NOT NULL DEFAULT 0,
      error      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_plans_goal    ON plans(goal_id);
    CREATE INDEX IF NOT EXISTS idx_items_plan    ON plan_items(plan_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_goal ON sessions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_messages_thr  ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_item  ON lessons(plan_item_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status   ON jobs(status);
  `);

  // guarded column adds
  const addCol = (table: string, col: string, def: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
  };
  // goals gain a parent (for decomposed "track" sub-goals)
  addCol("goals", "parent_goal_id", "parent_goal_id INTEGER REFERENCES goals(id) ON DELETE CASCADE");
  // lessons can be flagged for web-grounding and carry their cited sources
  addCol("lessons", "needs_current", "needs_current INTEGER NOT NULL DEFAULT 0");
  addCol("lessons", "sources", "sources TEXT NOT NULL DEFAULT '[]'");
  // multi-tenant: user ownership on the root entities (children isolate via FK chains)
  addCol("goals", "user_id", "user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addCol("sessions", "user_id", "user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addCol("threads", "user_id", "user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addCol("presentations", "user_id", "user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  addCol("books", "user_id", "user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  // lesson completion: set when the user reads/marks a section done (null = not done)
  addCol("lessons", "completed_at", "completed_at TEXT");
  // spaced-repetition state (null due = not enrolled in reviews)
  addCol("lessons", "srs_due", "srs_due TEXT");
  addCol("lessons", "srs_interval", "srs_interval REAL NOT NULL DEFAULT 0");
  addCol("lessons", "srs_ease", "srs_ease REAL NOT NULL DEFAULT 2.3");
  addCol("lessons", "srs_reps", "srs_reps INTEGER NOT NULL DEFAULT 0");
  addCol("lessons", "srs_last", "srs_last TEXT");
  // jobs run with the enqueuing user's AI credentials
  addCol("jobs", "user_id", "user_id INTEGER");
  // each user's content is generated in their chosen language
  addCol("users", "language", "language TEXT NOT NULL DEFAULT 'en'");
  // display name for certificates (falls back to email local-part if empty)
  addCol("users", "name", "name TEXT NOT NULL DEFAULT ''");
  // a graded section keeps its result (e.g. "A", "92%") for the transcript
  addCol("lessons", "grade", "grade TEXT NOT NULL DEFAULT ''");
}

export function getDb(): DatabaseSync {
  if (g.__abranyDb) return g.__abranyDb;
  mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  migrate(db);
  g.__abranyDb = db;
  return db;
}
