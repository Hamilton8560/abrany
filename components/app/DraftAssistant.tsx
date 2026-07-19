"use client";

import { useState } from "react";
import { SURFACES } from "@/lib/draftSurfaces";

/** One turn of the drafting chat. */
type Turn = { role: "user" | "assistant"; content: string };
type DraftResult =
  | { mode: "ask"; question: string; quickReplies?: string[] }
  | { mode: "draft"; fields: Record<string, string>; summary: string };

function Sparkle({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"
        fill="currentColor"
      />
      <path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

/**
 * "Draft with AI" — a reusable co-pilot that sits next to any create form. It
 * runs a short SMART conversation, then fills the parent form's fields (via
 * onApply) for the user to review. The parent form stays the source of truth;
 * this only writes values into it.
 */
export default function DraftAssistant({
  surfaceId,
  context,
  seed,
  onApply,
  triggerLabel = "Draft with AI",
  className = "",
}: {
  surfaceId: string;
  context?: string;
  /** Prefill the first message from what the user already typed. */
  seed?: string;
  onApply: (values: Record<string, string>) => void;
  triggerLabel?: string;
  className?: string;
}) {
  const surface = SURFACES[surfaceId];
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<DraftResult | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!surface) return null;

  const runTurn = async (nextTurns: Turn[], mustDraft = false) => {
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: surfaceId, messages: nextTurns, context: context ?? "", mustDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "The assistant is unavailable — fill the form by hand.");
        return;
      }
      const result = data as DraftResult;
      const said = result.mode === "ask" ? result.question : result.summary;
      setTurns([...nextTurns, { role: "assistant", content: said }]);
      setPending(result);
      if (result.mode === "draft") setEdits(result.fields);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const openPanel = () => {
    setOpen(true);
    if (turns.length === 0 && !busy) {
      if (seed?.trim()) {
        const nt: Turn[] = [{ role: "user", content: seed.trim() }];
        setTurns(nt);
        runTurn(nt);
      } else {
        runTurn([]);
      }
    }
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const nt: Turn[] = [...turns, { role: "user", content: t }];
    setTurns(nt);
    setInput("");
    runTurn(nt);
  };

  const apply = () => {
    onApply(edits);
    setOpen(false);
  };

  const reset = () => {
    setTurns([]);
    setPending(null);
    setEdits({});
    setInput("");
    setError(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        className={`inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-3.5 py-2 text-[12px] font-semibold text-accent transition hover:bg-accent/10 ${className}`}
      >
        <Sparkle /> {triggerLabel}
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-3 rounded-[16px] border border-accent/25 bg-white/70 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <Sparkle className="size-4 text-accent" /> Drafting your {surface.noun}
        </p>
        <button type="button" onClick={reset} className="text-[11px] text-muted hover:text-ink">
          Close
        </button>
      </div>

      {/* conversation so far (skip the seed's echo of raw user input) */}
      {turns.length > 0 && (
        <div className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div
              key={i}
              className={
                t.role === "assistant"
                  ? "self-start rounded-[12px] bg-white px-3 py-2 text-[12.5px] text-ink"
                  : "self-end rounded-[12px] bg-ink/90 px-3 py-2 text-[12.5px] text-white"
              }
            >
              {t.content}
            </div>
          ))}
        </div>
      )}

      {busy && <p className="text-[12px] text-muted">Thinking…</p>}
      {error && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-accent">{error}</p>
          <button
            type="button"
            onClick={() => runTurn(turns)}
            className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold text-ink"
          >
            Retry
          </button>
        </div>
      )}

      {/* ASK: question + quick replies + free text */}
      {!busy && pending?.mode === "ask" && (
        <div className="flex flex-col gap-2.5">
          {pending.quickReplies && pending.quickReplies.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pending.quickReplies.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] text-ink hover:border-accent"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
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
              placeholder="Type your answer…"
              className="min-h-[40px] flex-1 resize-none rounded-[14px] border border-line bg-white px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="glassx-dark rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <button
            type="button"
            onClick={() => runTurn(turns, true)}
            className="self-start text-[11px] text-muted underline hover:text-ink"
          >
            Skip questions — just draft it
          </button>
        </div>
      )}

      {/* DRAFT: editable review of the filled fields */}
      {!busy && pending?.mode === "draft" && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 rounded-[12px] bg-white p-3">
            {surface.fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{f.label}</span>
                {f.kind === "textarea" ? (
                  <textarea
                    value={edits[f.key] ?? ""}
                    onChange={(e) => setEdits({ ...edits, [f.key]: e.target.value })}
                    rows={2}
                    className="rounded-[10px] border border-line bg-white/70 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                  />
                ) : (
                  <input
                    type={f.kind === "date" ? "date" : "text"}
                    value={edits[f.key] ?? ""}
                    onChange={(e) => setEdits({ ...edits, [f.key]: e.target.value })}
                    className="rounded-[10px] border border-line bg-white/70 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                  />
                )}
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPending({ mode: "ask", question: "What should I change?" })}
              className="text-[11.5px] text-muted underline hover:text-ink"
            >
              Keep refining
            </button>
            <button
              type="button"
              onClick={apply}
              className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              Use this
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
