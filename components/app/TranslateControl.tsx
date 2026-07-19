"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { languageName } from "@/lib/languages";
import type { PublicUser } from "@/lib/user";
import type { ContentKind } from "@/lib/translate";

/**
 * "Translate to <my language>" for any generated content. Translation runs as a
 * background job (chunked + queued), so the button enqueues, then polls until the
 * result is cached and swaps the title/content in place. The reader can leave and
 * come back — the finished translation is waiting. Flipping back shows the
 * original at any time. All of this happens on the markdown source, never the
 * DOM, so it can't fight the browser translator or React.
 */

// Resolve the reader's language once per page load, shared across every control.
let myLangPromise: Promise<string> | null = null;
function getMyLang(): Promise<string> {
  if (!myLangPromise) {
    myLangPromise = api<{ user: PublicUser }>("/api/auth/me")
      .then((d) => d.user?.language || "en")
      .catch(() => "en");
  }
  return myLangPromise;
}

type Phase = "idle" | "working" | "error" | "same";
type StatusResp = {
  status: "ready" | "same" | "queued" | "error" | "idle";
  title?: string;
  content?: string;
  ahead?: number;
  pending?: number;
  error?: string;
};

const POLL_MS = 2500;
const MAX_POLLS = 80; // ~3.3 min ceiling before giving up

export function useContentTranslation(kind: ContentKind, id: number, srcTitle: string, srcContent: string) {
  const [myLang, setMyLang] = useState<string>("");
  const [on, setOn] = useState(false);
  const [data, setData] = useState<{ title: string; content: string } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [ahead, setAhead] = useState(0);
  const token = useRef(0); // bumps on target change / unmount to cancel stale polls
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!myLang) getMyLang().then(setMyLang);

  const stopPolling = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // reset when the target content changes; cancel any in-flight polling.
  useEffect(() => {
    token.current++;
    stopPolling();
    setOn(false);
    setData(null);
    setPhase("idle");
    setAhead(0);
    return stopPolling;
  }, [kind, id]);

  const apply = (r: StatusResp, mine: number): boolean => {
    if (token.current !== mine) return true; // stale — stop
    if (r.status === "same") { setPhase("same"); return true; }
    if (r.status === "ready") {
      setData({ title: r.title ?? srcTitle, content: r.content ?? srcContent });
      setOn(true);
      setPhase("idle");
      return true;
    }
    if (r.status === "error" || r.status === "idle") { setPhase("error"); return true; }
    // queued/working
    setPhase("working");
    if (typeof r.ahead === "number") setAhead(r.ahead);
    return false;
  };

  const poll = (mine: number, count: number) => {
    if (token.current !== mine) return;
    if (count > MAX_POLLS) { setPhase("error"); return; }
    api<StatusResp>(`/api/translate?kind=${kind}&id=${id}`)
      .then((r) => {
        if (apply(r, mine)) return;
        timer.current = setTimeout(() => poll(mine, count + 1), POLL_MS);
      })
      .catch(() => {
        if (token.current === mine) timer.current = setTimeout(() => poll(mine, count + 1), POLL_MS);
      });
  };

  const toggle = async () => {
    if (on) { setOn(false); return; }
    if (data) { setOn(true); return; }
    const mine = token.current;
    setPhase("working");
    try {
      const r = await api<StatusResp>("/api/translate", {
        method: "POST",
        body: JSON.stringify({ kind, id }),
      });
      if (apply(r, mine)) return;
      timer.current = setTimeout(() => poll(mine, 1), POLL_MS);
    } catch {
      if (token.current === mine) setPhase("error");
    }
  };

  return {
    myLangName: myLang ? languageName(myLang) : "",
    on,
    phase,
    ahead,
    displayTitle: on && data ? data.title : srcTitle,
    displayContent: on && data ? data.content : srcContent,
    toggle,
  };
}

const GlobeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
  </svg>
);

export function TranslateButton({
  t,
  className = "",
}: {
  t: ReturnType<typeof useContentTranslation>;
  className?: string;
}) {
  const label =
    t.phase === "working"
      ? t.ahead > 0
        ? `Translating… ${t.ahead} ahead`
        : "Translating…"
      : t.phase === "same"
        ? `Already in ${t.myLangName || "your language"}`
        : t.phase === "error"
          ? "Try again"
          : t.on
            ? "Show original"
            : t.myLangName
              ? `Translate to ${t.myLangName}`
              : "Translate";
  return (
    <button
      onClick={t.toggle}
      disabled={t.phase === "working" || t.phase === "same"}
      title={
        t.phase === "working"
          ? "Translating in the background — you can leave this page and come back"
          : t.on
            ? "Show the original language"
            : "Translate this into your language"
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60 ${
        t.on ? "bg-accent/12 text-accent" : "glassx text-ink"
      } ${className}`}
    >
      <GlobeIcon />
      {label}
    </button>
  );
}
