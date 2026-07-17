"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Message } from "@/lib/repo";
import type { PublicUser } from "@/lib/user";
import { languageName } from "@/lib/languages";
import { BrainGlyph, SendIcon } from "@/components/icons";
import Markdown from "./Markdown";

type ToolCall = { name: string; detail: string };
type ChatMsg = { role: "user" | "assistant"; content: string; thinking?: string; tools?: ToolCall[] };
type Mismatch = { code: string; name: string };

const STARTERS = [
  "I want to learn all of math — where do I even start?",
  "Help me get conversational in Spanish in 3 months.",
  "Break down learning to play piano for a total beginner.",
  "I keep losing focus. Build me a realistic weekly study routine.",
];

export default function CoachChat({
  goalId,
  studyGuideId,
}: {
  goalId?: number;
  studyGuideId?: number;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [myLang, setMyLang] = useState("en");
  const [guideTitle, setGuideTitle] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; mismatch: Mismatch } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api<{ messages: Message[] }>("/api/chat")
      .then((d) => setMessages(d.messages.map((m) => ({ role: m.role, content: m.content }))))
      .catch(() => {})
      .finally(() => setLoaded(true));
    api<{ user: PublicUser }>("/api/auth/me")
      .then((d) => setMyLang(d.user?.language || "en"))
      .catch(() => {});
  }, []);

  // When opened against a study guide, show a context banner.
  useEffect(() => {
    if (studyGuideId == null) {
      setGuideTitle(null);
      return;
    }
    api<{ guide: { title: string } }>(`/api/study-guides/${studyGuideId}`)
      .then((d) => setGuideTitle(d.guide?.title ?? "your study guide"))
      .catch(() => setGuideTitle("your study guide"));
  }, [studyGuideId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async (text: string, opts?: { confirmLang?: boolean; setLangTo?: string }) => {
    const content = text.trim();
    if (!content || streaming) return;

    // switch the preference first if the user chose to
    if (opts?.setLangTo) {
      await api("/api/settings/language", { method: "POST", body: JSON.stringify({ language: opts.setLangTo }) }).catch(() => {});
      setMyLang(opts.setLangTo);
    }

    setInput("");
    setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: "", thinking: "", tools: [] }]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          goalId: goalId ?? null,
          studyGuideId: studyGuideId ?? null,
          confirmLang: opts?.confirmLang ?? false,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.languageMismatch) {
          // roll back the optimistic bubbles and ask before generating
          setMessages((m) => m.slice(0, -2));
          setInput(content);
          setPending({ text: content, mismatch: data.languageMismatch as Mismatch });
          return;
        }
        throw new Error((data as { error?: string }).error || "Coach is unavailable");
      }
      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const patchLast = (fn: (last: ChatMsg) => ChatMsg) =>
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = fn(copy[copy.length - 1]);
          return copy;
        });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          let ev: { t: string; c: unknown };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.t === "think") patchLast((l) => ({ ...l, thinking: (l.thinking || "") + String(ev.c) }));
          else if (ev.t === "text") patchLast((l) => ({ ...l, content: l.content + String(ev.c) }));
          else if (ev.t === "tool") patchLast((l) => ({ ...l, tools: [...(l.tools || []), ev.c as ToolCall] }));
          else if (ev.t === "error") patchLast((l) => ({ ...l, content: l.content + `\n\n⚠️ ${String(ev.c)}` }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant" && !last.content) {
            copy[copy.length - 1] = {
              role: "assistant",
              content: `⚠️ ${(e as Error).message || "Coach is unavailable right now. Try again in a moment."}`,
            };
          }
          return copy;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const empty = loaded && messages.length === 0;
  const guideStarters = [
    "Give me a 3-question quiz on this to check my understanding.",
    "Explain the hardest part of this guide more simply.",
    "What are the most common mistakes this covers?",
    "Summarize the must-know points in 5 bullets.",
  ];

  return (
    <div className="glass flex h-[calc(100dvh-190px)] min-h-[440px] flex-col overflow-hidden rounded-[var(--radius-card-lg)] lg:h-[calc(100dvh-150px)]">
      {guideTitle && (
        <div className="flex items-center gap-2 border-b border-line/70 bg-accent/8 px-4 py-2.5 text-[12.5px] text-ink sm:px-6">
          <span className="size-1.5 shrink-0 rounded-full bg-accent" />
          <span className="min-w-0 truncate">
            Discussing your study guide: <span className="font-semibold">{guideTitle}</span>
          </span>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {empty && (
          <div className="mx-auto flex max-w-[520px] flex-col items-center gap-6 pt-6 text-center">
            <span className="glassx-dark grid size-14 place-items-center rounded-full text-white">
              <BrainGlyph className="size-7" />
            </span>
            <div>
              <h2 className="font-display text-[24px] font-extrabold uppercase text-ink">
                {guideTitle ? "Discuss your study guide" : "Your training coach"}
              </h2>
              <p className="mt-2 text-[14px] text-muted">
                {guideTitle
                  ? "I've read your study guide. Ask me anything about it, and I'll explain, quiz you, or go deeper."
                  : "Tell me what you want to learn. I'll keep it realistic and break it into steps you can actually do."}
              </p>
            </div>
            <div className="grid w-full gap-2.5 sm:grid-cols-2">
              {(guideTitle ? guideStarters : STARTERS).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-[14px] bg-white/60 px-4 py-3 text-left text-[13px] font-medium text-ink transition-colors hover:bg-white/90"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto flex max-w-[720px] flex-col gap-5">
          {messages.map((m, i) => (
            <Bubble key={i} msg={m} streaming={streaming && i === messages.length - 1} />
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-line/70 bg-white/40 p-3 sm:p-4"
      >
        <div className="mx-auto flex max-w-[720px] items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask your coach anything…"
            className="max-h-40 min-h-[46px] flex-1 resize-none rounded-[16px] border border-line bg-white/80 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            aria-label="Send"
            className="glassx-dark grid size-[46px] shrink-0 place-items-center rounded-full text-white disabled:opacity-50"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
      </form>

      {pending && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm"
          onClick={() => setPending(null)}
        >
          <div
            className="glass w-full max-w-[420px] rounded-[var(--radius-card-lg)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[20px] font-extrabold uppercase text-ink">Switch language?</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              You&apos;re writing in <span className="font-semibold text-ink">{pending.mismatch.name}</span>, but
              your content language is set to <span className="font-semibold text-ink">{languageName(myLang)}</span>.
              Switch to {pending.mismatch.name} so everything is generated in it?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => {
                  const p = pending;
                  setPending(null);
                  send(p.text, { confirmLang: true, setLangTo: p.mismatch.code });
                }}
                className="glassx-dark rounded-full px-5 py-3 text-[13px] font-semibold text-white"
              >
                {`Switch to ${pending.mismatch.name} & continue`}
              </button>
              <button
                onClick={() => {
                  const p = pending;
                  setPending(null);
                  send(p.text, { confirmLang: true });
                }}
                className="glassx rounded-full px-5 py-3 text-[13px] font-semibold text-ink"
              >
                Keep {languageName(myLang)}
              </button>
              <button
                onClick={() => setPending(null)}
                className="px-5 py-2 text-[12.5px] font-semibold text-muted hover:text-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ msg, streaming }: { msg: ChatMsg; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const thinkRef = useRef<HTMLDivElement>(null);

  // The tutor may emit <remember>…</remember> tags to save to your profile; never show them.
  const shown = msg.content
    .replace(/<remember[\s\S]*?<\/remember>/gi, "")
    .replace(/<remember[\s\S]*$/i, "")
    .trim();
  const thinking = (msg.thinking || "").trim();
  const hasAnswer = shown.length > 0;
  // While the tutor is thinking with no answer yet, show the reasoning live; once
  // the answer arrives, collapse it behind a toggle so the reply stays front-and-center.
  const showThinking = thinking.length > 0 && (open || (streaming && !hasAnswer));

  // keep the live reasoning scrolled to the newest tokens
  useEffect(() => {
    if (showThinking && streaming && thinkRef.current) thinkRef.current.scrollTop = thinkRef.current.scrollHeight;
  }, [thinking, showThinking, streaming]);

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="glassx-dark max-w-[85%] rounded-[18px] rounded-br-[6px] px-4 py-2.5 text-[14px] leading-relaxed text-white">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
        <BrainGlyph className="size-4" />
      </span>
      <div className="flex max-w-[85%] flex-col gap-2">
        {/* live reasoning ("Thinking") */}
        {thinking.length > 0 && (
          <div className="overflow-hidden rounded-[14px] border border-line/70 bg-white/45">
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left"
            >
              <BrainGlyph className={`size-3.5 text-accent ${streaming && !hasAnswer ? "anim-bob" : ""}`} />
              <span className="text-[12px] font-semibold text-ink">
                {streaming && !hasAnswer ? "Thinking…" : "Reasoning"}
              </span>
              <span className="ml-auto text-[11px] font-medium text-muted">{open ? "hide" : showThinking ? "" : "show"}</span>
            </button>
            {showThinking && (
              <div
                ref={thinkRef}
                className="max-h-[180px] overflow-y-auto border-t border-line/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted"
              >
                {thinking}
              </div>
            )}
          </div>
        )}

        {/* tool calls (memory writes, etc.) */}
        {(msg.tools?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.tools!.map((t, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full bg-up/12 px-2.5 py-1 text-[11.5px] font-medium text-[#1f8043]"
                title={t.detail}
              >
                <BrainGlyph className="size-3" />
                {t.name === "remember" ? "Remembered" : t.name}
                {t.detail ? <span className="max-w-[220px] truncate font-normal opacity-80">· {t.detail}</span> : null}
              </span>
            ))}
          </div>
        )}

        {/* the answer */}
        {(hasAnswer || (streaming && !thinking)) && (
          <div className="rounded-[18px] rounded-tl-[6px] bg-white/70 px-4 py-3">
            {shown ? <Markdown>{shown}</Markdown> : null}
            {streaming && <span className="anim-bob ml-0.5 inline-block h-3.5 w-[2px] bg-accent align-middle" />}
          </div>
        )}
      </div>
    </div>
  );
}
