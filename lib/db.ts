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

    -- businesses: white-label branding + a partner API key for API/MCP access
    CREATE TABLE IF NOT EXISTS orgs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      logo          TEXT NOT NULL DEFAULT '',        -- data URL, rendered on certs & org pages
      tagline       TEXT NOT NULL DEFAULT '',
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_key       TEXT NOT NULL UNIQUE,            -- bearer key for /api/v1 + /api/mcp
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS org_members (
      org_id     INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL DEFAULT 'member',     -- admin | member
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (org_id, user_id)
    );

    -- invites for people who don't have an account yet (auto-accepted at signup)
    CREATE TABLE IF NOT EXISTS org_invites (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id     INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      email      TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(org_id, email)
    );

    -- education a company assigned to an employee (the goal belongs to the employee)
    CREATE TABLE IF NOT EXISTS assignments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id       INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      goal_id      INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      assigned_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note         TEXT NOT NULL DEFAULT '',
      due_at       TEXT,                             -- ISO date; null = no deadline
      status       TEXT NOT NULL DEFAULT 'assigned', -- assigned|in_progress|passed|failed
      completed_at TEXT,                             -- when it flipped to passed
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_assign_org  ON assignments(org_id);
    CREATE INDEX IF NOT EXISTS idx_assign_user ON assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_members_user ON org_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_invites_email ON org_invites(email);

    -- reusable, org-owned lesson-plan templates (authored once, deployed to many)
    CREATE TABLE IF NOT EXISTS programs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_lang TEXT NOT NULL DEFAULT 'en',   -- language the program is authored in
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS program_milestones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL DEFAULT 0,
      title       TEXT NOT NULL,
      detail      TEXT NOT NULL DEFAULT '',
      estimate    TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS program_lessons (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      milestone_id INTEGER NOT NULL REFERENCES program_milestones(id) ON DELETE CASCADE,
      order_index  INTEGER NOT NULL DEFAULT 0,
      title        TEXT NOT NULL,
      objective    TEXT NOT NULL DEFAULT '',
      kind         TEXT NOT NULL DEFAULT 'read',
      content      TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_prog_org      ON programs(org_id);
    CREATE INDEX IF NOT EXISTS idx_prog_ms_prog  ON program_milestones(program_id);
    CREATE INDEX IF NOT EXISTS idx_prog_le_ms    ON program_lessons(milestone_id);

    -- learner memory: durable facts the tutor keeps about the user, so coaching
    -- is personalized across sessions (their goals, preferences, what trips them up)
    CREATE TABLE IF NOT EXISTS user_memories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category   TEXT NOT NULL DEFAULT 'context',  -- preference | goal | struggle | context
      text       TEXT NOT NULL,
      source     TEXT NOT NULL DEFAULT 'tutor',    -- tutor | user
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories(user_id);

    -- first-class study guides: generated on demand, stored, browsable, and
    -- discussable with the tutor (not just a transient exam popup)
    CREATE TABLE IF NOT EXISTS study_guides (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      goal_id      INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      plan_item_id INTEGER REFERENCES plan_items(id) ON DELETE SET NULL,
      title        TEXT NOT NULL,
      topic        TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT 'topic',      -- goal | milestone | topic | exam
      content      TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'generating', -- generating|ready|error
      error        TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_guides_user ON study_guides(user_id);

    -- marketplace: a published course points at the author's goal; cloning copies it
    CREATE TABLE IF NOT EXISTS course_listings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id       INTEGER NOT NULL UNIQUE REFERENCES goals(id) ON DELETE CASCADE,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      blurb         TEXT NOT NULL DEFAULT '',
      tags          TEXT NOT NULL DEFAULT '',              -- comma-separated
      age_group     TEXT NOT NULL DEFAULT 'adults',        -- kids|teens|adults|seniors|all
      clones        INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- community forums (seeded by age group + learning interest)
    CREATE TABLE IF NOT EXISTS forums (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT NOT NULL UNIQUE,
      kind        TEXT NOT NULL,                           -- age | interest
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS forum_threads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      forum_id   INTEGER NOT NULL REFERENCES forums(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS forum_posts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id  INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_threads_forum ON forum_threads(forum_id);
    CREATE INDEX IF NOT EXISTS idx_posts_thread  ON forum_posts(thread_id);
    CREATE INDEX IF NOT EXISTS idx_listings_owner ON course_listings(owner_user_id);

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
  addCol("lessons", "srs_optout", "srs_optout INTEGER NOT NULL DEFAULT 0");
  // jobs run with the enqueuing user's AI credentials
  addCol("jobs", "user_id", "user_id INTEGER");
  // idempotency key so a second click / concurrent request for the same target
  // reuses the in-flight job instead of generating a duplicate.
  addCol("jobs", "dedup_key", "dedup_key TEXT");
  // hard backstop against a race: only ONE active (queued|running) job per key.
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_active_dedup ON jobs(dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('queued','running')",
  );
  // each user's content is generated in their chosen language
  addCol("users", "language", "language TEXT NOT NULL DEFAULT 'en'");
  // display name for certificates (falls back to email local-part if empty)
  addCol("users", "name", "name TEXT NOT NULL DEFAULT ''");
  // a graded section keeps its result (e.g. "A", "92%") for the transcript
  addCol("lessons", "grade", "grade TEXT NOT NULL DEFAULT ''");
  // email notifications (Resend): temp-password-issued accounts must reset before
  // using the app; users opt in/out of certificate + weekly-report emails
  addCol("users", "must_reset_password", "must_reset_password INTEGER NOT NULL DEFAULT 0");
  addCol("users", "notify_certificates", "notify_certificates INTEGER NOT NULL DEFAULT 1");
  addCol("users", "notify_weekly_report", "notify_weekly_report INTEGER NOT NULL DEFAULT 1");
  addCol("users", "last_weekly_email_at", "last_weekly_email_at TEXT");
  // accumulated seconds the learner spent reading this section (heartbeat-fed)
  addCol("lessons", "read_sec", "read_sec INTEGER NOT NULL DEFAULT 0");
  // V2 plans: legacy rows stay version 1 and render exactly as before
  addCol("plans", "version", "version INTEGER NOT NULL DEFAULT 1");
  addCol("plans", "intake", "intake TEXT NOT NULL DEFAULT ''"); // JSON: level/hoursPerWeek/targetDate/focus
  addCol("plan_items", "outcomes", "outcomes TEXT NOT NULL DEFAULT '[]'"); // measurable "you can …"
  addCol("plan_items", "hours", "hours REAL NOT NULL DEFAULT 0");
  addCol("plan_items", "difficulty", "difficulty TEXT NOT NULL DEFAULT ''"); // intro|core|advanced
  // white-label: certs issued for org-assigned training carry the company brand
  addCol("certificates", "org_id", "org_id INTEGER REFERENCES orgs(id) ON DELETE SET NULL");
  addCol("certificates", "org_name", "org_name TEXT NOT NULL DEFAULT ''");
  addCol("certificates", "org_logo", "org_logo TEXT NOT NULL DEFAULT ''");

  // assignments deployed from a reusable program link back to it (SET NULL keeps
  // the employee's goal alive if the program is later deleted)
  addCol(
    "assignments",
    "program_id",
    "program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_assign_program ON assignments(program_id)");

  // the language a piece of content was authored in (NULL = unknown → detected
  // lazily on first translate). Powers "show translate button only when it isn't
  // already in my language" and stamps the epub/OPF correctly.
  addCol("lessons", "language", "language TEXT");
  addCol("chapters", "language", "language TEXT");
  addCol("books", "language", "language TEXT");
  addCol("presentations", "language", "language TEXT");
  addCol("study_guides", "language", "language TEXT");

  // cached AI translations of generated content, keyed by (kind, source, lang).
  // `source_stamp` is the source row's updated_at at translation time — if the
  // source is later regenerated, the stale cache entry is ignored/replaced.
  db.exec(`
    CREATE TABLE IF NOT EXISTS translations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      kind         TEXT NOT NULL,            -- lesson|chapter|book|presentation|study_guide
      source_id    INTEGER NOT NULL,
      lang         TEXT NOT NULL,            -- target language code
      title        TEXT NOT NULL DEFAULT '',
      content      TEXT NOT NULL DEFAULT '',
      source_stamp TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kind, source_id, lang)
    );
  `);

  // seed the community forums (idempotent; slugs are stable identifiers)
  const seedForum = db.prepare(
    "INSERT OR IGNORE INTO forums (slug, kind, title, description, order_index) VALUES (?, ?, ?, ?, ?)",
  );
  (
    [
      ["kids-parents", "age", "Kids & Parents", "Learning together under 13 — parents welcome", 0],
      ["teens", "age", "Teens", "13–17: school, skills, and what comes next", 1],
      ["adults", "age", "Adults", "Careers, upskilling, and lifelong learning", 2],
      ["fifty-plus", "age", "50+", "It's never too late — learning after fifty", 3],
      ["languages", "interest", "Languages", "Vocab streaks, immersion tips, conversation partners", 10],
      ["stem-coding", "interest", "STEM & Coding", "Math, science, engineering, programming", 11],
      ["trades-safety", "interest", "Trades & Safety", "Welding, electrical, OSHA, certifications on the job", 12],
      ["business-money", "interest", "Business & Money", "Entrepreneurship, sales, finance, investing", 13],
      ["arts-music", "interest", "Arts & Music", "Instruments, drawing, writing, performance", 14],
      ["faith-philosophy", "interest", "Faith & Philosophy", "Scripture, ethics, big questions, reflective study", 15],
      ["test-prep", "interest", "Test Prep & Certs", "Exams, licenses, and how to pass them", 16],
      ["health-fitness", "interest", "Health & Fitness", "Training the body alongside the mind", 17],
    ] as const
  ).forEach(([slug, kind, title, description, order]) => seedForum.run(slug, kind, title, description, order));
}

export function getDb(): DatabaseSync {
  if (g.__abranyDb) return g.__abranyDb;
  mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  migrate(db);
  g.__abranyDb = db;
  return db;
}
