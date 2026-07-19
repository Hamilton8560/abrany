import { getDb } from "./db";
import { detectLanguage } from "./langdetect";

/**
 * Reads generated content of any kind, resolves what language it was authored in
 * (stored, else detected once and persisted), and caches AI translations so a
 * learner only pays to translate a given item into a given language once. The
 * per-kind table/column map is a fixed whitelist — never user input — so the
 * interpolated SQL below is safe.
 */

export type ContentKind = "lesson" | "chapter" | "presentation" | "study_guide";

type KindSpec = { table: string; titleCol: string; contentCol: string };

const SPEC: Record<ContentKind, KindSpec> = {
  lesson: { table: "lessons", titleCol: "title", contentCol: "content" },
  chapter: { table: "chapters", titleCol: "title", contentCol: "content" },
  presentation: { table: "presentations", titleCol: "title", contentCol: "content" },
  study_guide: { table: "study_guides", titleCol: "title", contentCol: "content" },
};

export function isContentKind(k: string): k is ContentKind {
  return k in SPEC;
}

/**
 * Split markdown into translation-sized chunks WITHOUT ever cutting through a
 * fenced code/mermaid/arch block (those stay whole so the model can't corrupt
 * their syntax). Paragraph/blank-line boundaries are the split points; blocks are
 * greedily packed up to ~maxChars. Keeping each request small is what keeps
 * MiniMax fast and reliable; the worker translates the chunks one at a time so a
 * big document never hogs more than one shared queue slot.
 */
export function chunkMarkdown(md: string, maxChars = 3000): string[] {
  const lines = md.split("\n");
  const blocks: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null; // the ``` or ~~~ marker that opened the current fence
  const flush = () => {
    if (buf.length) blocks.push(buf.join("\n"));
    buf = [];
  };
  for (const line of lines) {
    const m = /^\s*(```+|~~~+)/.exec(line);
    if (m) {
      if (fence == null) fence = m[1][0];
      else if (line.trim().startsWith(fence.repeat(3))) fence = null;
      buf.push(line);
      continue;
    }
    if (fence != null) {
      buf.push(line);
      continue;
    }
    if (line.trim() === "") flush();
    else buf.push(line);
  }
  flush();

  const chunks: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const b of blocks) {
    const bl = b.length + 2;
    if (len > 0 && len + bl > maxChars) {
      chunks.push(cur.join("\n\n"));
      cur = [];
      len = 0;
    }
    cur.push(b);
    len += bl;
  }
  if (cur.length) chunks.push(cur.join("\n\n"));
  return chunks.length ? chunks : [md];
}

export type SourceContent = {
  title: string;
  content: string;
  language: string | null; // authored language code, null if unknown
  stamp: string; // source updated_at — used to invalidate stale cached translations
};

export function readContent(kind: ContentKind, id: number): SourceContent | null {
  const s = SPEC[kind];
  const row = getDb()
    .prepare(
      `SELECT ${s.titleCol} AS title, ${s.contentCol} AS content, language, updated_at AS stamp
       FROM ${s.table} WHERE id = ?`,
    )
    .get(id) as { title: string; content: string; language: string | null; stamp: string } | undefined;
  if (!row) return null;
  return { title: row.title ?? "", content: row.content ?? "", language: row.language ?? null, stamp: row.stamp ?? "" };
}

function setContentLanguage(kind: ContentKind, id: number, lang: string): void {
  const s = SPEC[kind];
  getDb().prepare(`UPDATE ${s.table} SET language = ? WHERE id = ?`).run(lang, id);
}

/**
 * The language a piece of content is in: its stored value, or a one-time
 * detection from the text (persisted so we never re-detect). Returns "" when the
 * text is too short/ambiguous to call — callers treat "" as "offer translation".
 */
export function resolveSourceLanguage(kind: ContentKind, src: SourceContent, id: number): string {
  if (src.language) return src.language;
  const detected = detectLanguage(`${src.title}\n\n${src.content}`.slice(0, 4000));
  if (detected) {
    setContentLanguage(kind, id, detected);
    return detected;
  }
  return "";
}

export function getCachedTranslation(
  kind: ContentKind,
  id: number,
  lang: string,
  stamp: string,
): { title: string; content: string } | null {
  const row = getDb()
    .prepare(
      `SELECT title, content FROM translations
       WHERE kind = ? AND source_id = ? AND lang = ? AND source_stamp = ?`,
    )
    .get(kind, id, lang, stamp) as { title: string; content: string } | undefined;
  return row ?? null;
}

export function saveTranslation(
  kind: ContentKind,
  id: number,
  lang: string,
  title: string,
  content: string,
  stamp: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO translations (kind, source_id, lang, title, content, source_stamp)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, source_id, lang)
       DO UPDATE SET title = excluded.title, content = excluded.content,
                     source_stamp = excluded.source_stamp, created_at = datetime('now')`,
    )
    .run(kind, id, lang, title, content, stamp);
}
