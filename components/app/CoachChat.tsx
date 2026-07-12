"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Message } from "@/lib/repo";
import { BrainGlyph, SendIcon } from "@/components/icons";

type ChatMsg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "I want to learn all of math — where do I even start?",
  "Help me get conversational in Spanish in 3 months.",
  "Break down learning to play piano for a total beginner.",
  "I keep losing focus. Build me a realistic weekly study routine.",
];

export default function CoachChat({ goalId }: { goalId?: number }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api<{ messages: Message[] }>("/api/chat")
      .then((d) => setMessages(d.messages.map((m) => ({ role: m.role, content: m.content }))))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: "" }]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, goalId: goalId ?? null }),
        signal: ctrl.signal,
      });
      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + chunk,
          };
          return copy;
        });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant" && !last.content) {
            copy[copy.length - 1] = {
              role: "assistant",
              content: "⚠️ Coach is unavailable right now. Try again in a moment.",
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

  return (
    <div className="glass flex h-[calc(100dvh-190px)] min-h-[440px] flex-col overflow-hidden rounded-[var(--radius-card-lg)] lg:h-[calc(100dvh-150px)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {empty && (
          <div className="mx-auto flex max-w-[520px] flex-col items-center gap-6 pt-6 text-center">
            <span className="glassx-dark grid size-14 place-items-center rounded-full text-white">
              <BrainGlyph className="size-7" />
            </span>
            <div>
              <h2 className="font-display text-[24px] font-extrabold uppercase text-ink">
                Your training coach
              </h2>
              <p className="mt-2 text-[14px] text-muted">
                Tell me what you want to learn. I&apos;ll keep it realistic and break it into steps
                you can actually do.
              </p>
            </div>
            <div className="grid w-full gap-2.5 sm:grid-cols-2">
              {STARTERS.map((s) => (
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
            <Bubble key={i} role={m.role} content={m.content} streaming={streaming && i === messages.length - 1} />
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
    </div>
  );
}

function Bubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="glassx-dark max-w-[85%] rounded-[18px] rounded-br-[6px] px-4 py-2.5 text-[14px] leading-relaxed text-white">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
        <BrainGlyph className="size-4" />
      </span>
      <div className="max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-tl-[6px] bg-white/70 px-4 py-3 text-[14px] leading-relaxed text-ink">
        {content || (streaming ? "" : "")}
        {streaming && <span className="anim-bob ml-0.5 inline-block h-3.5 w-[2px] bg-accent align-middle" />}
      </div>
    </div>
  );
}
