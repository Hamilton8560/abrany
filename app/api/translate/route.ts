import { NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import {
  userOwnsLesson,
  userOwnsChapter,
  userOwnsPresentation,
  userOwnsStudyGuide,
  findActiveJob,
  latestJobByDedup,
  jobBacklog,
} from "@/lib/repo";
import {
  isContentKind,
  readContent,
  resolveSourceLanguage,
  getCachedTranslation,
  type ContentKind,
} from "@/lib/translate";
import { enqueueTranslation } from "@/lib/worker";
import { llmContext } from "@/lib/minimax";
import { isSupported } from "@/lib/languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNS: Record<ContentKind, (userId: number, id: number) => boolean> = {
  lesson: userOwnsLesson,
  chapter: userOwnsChapter,
  presentation: userOwnsPresentation,
  study_guide: userOwnsStudyGuide,
};

const dedupKey = (kind: string, id: number, lang: string) => `translation:${kind}:${id}:${lang}`;

/** Validate + authorize a translate request; returns the parsed target or an error response. */
function resolve(user: { id: number; language: string }, kind: string, id: number, targetRaw: string) {
  if (!isContentKind(kind) || !Number.isFinite(id)) return { err: NextResponse.json({ error: "Bad request" }, { status: 400 }) };
  const target = (targetRaw || user.language || "en").toString();
  if (!isSupported(target)) return { err: NextResponse.json({ error: "Unsupported language" }, { status: 400 }) };
  if (!OWNS[kind](user.id, id)) return { err: forbidden() };
  return { kind: kind as ContentKind, id, target };
}

/**
 * GET ?kind=&id=&lang= — poll the status of a translation. Returns the finished
 * translation when ready (served from cache), otherwise where it is in the queue.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const r = resolve(user, url.searchParams.get("kind") ?? "", Number(url.searchParams.get("id")), url.searchParams.get("lang") ?? "");
  if ("err" in r) return r.err;
  const { kind, id, target } = r;

  const src = readContent(kind, id);
  if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sourceLang = resolveSourceLanguage(kind, src, id);
  if (sourceLang && sourceLang === target)
    return NextResponse.json({ status: "same", language: target, title: src.title, content: src.content });

  const cached = getCachedTranslation(kind, id, target, src.stamp);
  if (cached) return NextResponse.json({ status: "ready", language: target, title: cached.title, content: cached.content });

  const key = dedupKey(kind, id, target);
  if (findActiveJob(key)) {
    const { ahead, pending } = jobBacklog(user.id);
    return NextResponse.json({ status: "queued", ahead, pending });
  }
  const last = latestJobByDedup(key);
  if (last?.status === "error")
    return NextResponse.json({ status: "error", error: last.error || "Translation failed" });
  return NextResponse.json({ status: "idle" });
}

/**
 * POST { kind, id, targetLang? } — start (or reuse) a background translation into
 * the reader's language. Returns the cached result instantly if present, notes a
 * same-language no-op, or enqueues a job and returns its queue position. Free for
 * keyless learners on a free-AI deployment; BYO users spend their own. Because the
 * result is cached, the reader can leave the page and it'll be waiting on return.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const r = resolve(user, (body.kind ?? "").toString(), Number(body.id), (body.targetLang ?? "").toString());
  if ("err" in r) return r.err;
  const { kind, id, target } = r;

  const src = readContent(kind, id);
  if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!src.content.trim()) return NextResponse.json({ error: "Nothing to translate yet" }, { status: 409 });

  const sourceLang = resolveSourceLanguage(kind, src, id);
  if (sourceLang && sourceLang === target)
    return NextResponse.json({ status: "same", language: target, title: src.title, content: src.content });

  const cached = getCachedTranslation(kind, id, target, src.stamp);
  if (cached) return NextResponse.json({ status: "ready", language: target, title: cached.title, content: cached.content });

  // Needs generating — make sure the user can actually drive the AI first.
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });

  const job = enqueueTranslation(kind, id, target, user.id);
  const { ahead, pending } = jobBacklog(user.id);
  return NextResponse.json({ status: "queued", jobId: job.id, ahead, pending }, { status: 202 });
}
