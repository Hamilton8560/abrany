"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtWhen } from "@/lib/client";
import { ForumIcon, PlusIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { plural } from "@/lib/i18n";

type Forum = {
  id: number;
  slug: string;
  kind: "age" | "interest";
  title: string;
  description: string;
  threads: number;
  posts: number;
  last_activity: string | null;
};

type Thread = {
  id: number;
  title: string;
  body: string;
  author: string;
  replies: number;
  user_id: number;
  created_at: string;
  updated_at: string;
};

type ThreadDetail = Thread & {
  forum: { slug: string; title: string };
  postRows: { id: number; author: string; user_id: number; body: string; created_at: string }[];
};

type View = { at: "forums" } | { at: "forum"; forum: Forum } | { at: "thread"; id: number; forum: Forum };

export default function CommunityPanel() {
  const [view, setView] = useState<View>({ at: "forums" });

  if (view.at === "forum")
    return <ForumView forum={view.forum} onBack={() => setView({ at: "forums" })} onOpen={(id) => setView({ at: "thread", id, forum: view.forum })} />;
  if (view.at === "thread")
    return <ThreadView id={view.id} onBack={() => setView({ at: "forum", forum: view.forum })} />;
  return <ForumsView onOpen={(forum) => setView({ at: "forum", forum })} />;
}

/* ── forum directory ───────────────────────────────────────── */

function ForumsView({ onOpen }: { onOpen: (f: Forum) => void }) {
  const t = useT();
  const [forums, setForums] = useState<Forum[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ forums: Forum[] }>("/api/community/forums")
      .then((d) => setForums(d.forums))
      .catch((e) => setError(e instanceof Error ? e.message : t("Could not load forums")));
  }, [t]);

  if (error) return <p className="text-[13px] text-accent">{error}</p>;
  if (!forums) return <p className="text-[13px] text-muted">{t("Loading…")}</p>;

  const groups: { kind: Forum["kind"]; label: string }[] = [
    { kind: "age", label: t("By age group") },
    { kind: "interest", label: t("By interest") },
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ kind, label }) => (
        <section key={kind}>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {forums
              .filter((f) => f.kind === kind)
              .map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => onOpen(f)}
                    className="glass flex w-full items-start gap-3 rounded-[var(--radius-card-lg)] p-4 text-left transition-all hover:-translate-y-0.5"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent/12 text-accent">
                      <ForumIcon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-bold text-ink">{t(f.title)}</span>
                      <span className="block text-[12px] leading-snug text-muted">{t(f.description)}</span>
                      <span className="mt-1 block text-[10.5px] font-medium text-muted">
                        {t("{threads} threads · {posts} replies", { threads: f.threads, posts: f.posts })}
                        {f.last_activity && <> · {t("active {when}", { when: fmtWhen(f.last_activity) })}</>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ── one forum: thread list + new thread ───────────────────── */

function ForumView({ forum, onBack, onOpen }: { forum: Forum; onBack: () => void; onOpen: (id: number) => void }) {
  const t = useT();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api<{ threads: Thread[] }>(`/api/community/threads?forum=${forum.slug}`)
      .then((d) => setThreads(d.threads))
      .catch((e) => setError(e instanceof Error ? e.message : t("Could not load threads")));
  }, [forum.slug, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const post = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const d = await api<{ threadId: number }>("/api/community/threads", {
        method: "POST",
        body: JSON.stringify({ forumSlug: forum.slug, title, body }),
      });
      setTitle("");
      setBody("");
      setComposing(false);
      refresh();
      onOpen(d.threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not post"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="text-[13px] font-medium text-muted hover:text-ink">
          ← {t("All forums")}
        </button>
        <button
          onClick={() => setComposing((v) => !v)}
          className="glassx flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink"
        >
          <PlusIcon className="size-4" /> {t("New thread")}
        </button>
      </div>

      <div>
        <h2 className="font-display text-[20px] font-extrabold uppercase text-ink">{t(forum.title)}</h2>
        <p className="text-[12.5px] text-muted">{t(forum.description)}</p>
      </div>

      {composing && (
        <div className="glass flex flex-col gap-2.5 rounded-[var(--radius-card-lg)] p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("Thread title")}
            className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("Say more — what are you learning, what worked, what do you need?")}
            rows={4}
            className="rounded-[16px] border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          <div className="flex justify-end">
            <button
              onClick={post}
              disabled={busy || !title.trim()}
              className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? t("Posting…") : t("Post thread")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[12.5px] text-accent">{error}</p>}
      {!threads ? (
        <p className="text-[13px] text-muted">{t("Loading…")}</p>
      ) : threads.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">{t("No threads yet — start the first one.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map((th) => (
            <li key={th.id}>
              <button
                onClick={() => onOpen(th.id)}
                className="glass block w-full rounded-[16px] px-4 py-3 text-left transition-all hover:-translate-y-0.5"
              >
                <p className="text-[13.5px] font-semibold text-ink">{th.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {th.author} · {fmtWhen(th.created_at)} · {plural(t, th.replies, "{n} reply", "{n} replies")}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── one thread: posts + reply ─────────────────────────────── */

function ThreadView({ id, onBack }: { id: number; onBack: () => void }) {
  const t = useT();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api<{ thread: ThreadDetail }>(`/api/community/threads/${id}`)
      .then((d) => setThread(d.thread))
      .catch((e) => setError(e instanceof Error ? e.message : t("Could not load the thread")));
  }, [id, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const send = async () => {
    if (!reply.trim() || busy) return;
    setBusy(true);
    try {
      const d = await api<{ thread: ThreadDetail }>(`/api/community/threads/${id}`, {
        method: "POST",
        body: JSON.stringify({ body: reply }),
      });
      setThread(d.thread);
      setReply("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not reply"));
    } finally {
      setBusy(false);
    }
  };

  if (error) return (
    <div className="flex flex-col gap-3">
      <button onClick={onBack} className="self-start text-[13px] font-medium text-muted hover:text-ink">← {t("Back")}</button>
      <p className="text-[13px] text-accent">{error}</p>
    </div>
  );
  if (!thread) return <p className="text-[13px] text-muted">{t("Loading…")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="self-start text-[13px] font-medium text-muted hover:text-ink">
        ← {t(thread.forum.title)}
      </button>

      <article className="glass rounded-[var(--radius-card-lg)] p-5">
        <h2 className="text-[17px] font-bold leading-snug text-ink">{thread.title}</h2>
        <p className="mt-1 text-[11px] text-muted">
          {thread.author} · {fmtWhen(thread.created_at)}
        </p>
        {thread.body && <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{thread.body}</p>}
      </article>

      {thread.postRows.map((p) => (
        <article key={p.id} className="ml-4 rounded-[16px] border border-line bg-white/60 p-4">
          <p className="text-[11px] font-semibold text-ink">
            {p.author} <span className="font-normal text-muted">· {fmtWhen(p.created_at)}</span>
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{p.body}</p>
        </article>
      ))}

      <div className="ml-4 flex flex-col gap-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={t("Write a reply…")}
          rows={3}
          className="rounded-[16px] border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        <div className="flex justify-end">
          <button
            onClick={send}
            disabled={busy || !reply.trim()}
            className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? t("Replying…") : t("Reply")}
          </button>
        </div>
      </div>
    </div>
  );
}
