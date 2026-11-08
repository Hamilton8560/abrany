"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { languageName } from "@/lib/languages";
import type { PublicUser } from "@/lib/user";
import type { ContentKind } from "@/lib/translate";
import { useI18n } from "@/lib/i18n/client";
import type { UiLocale } from "@/lib/i18n";

/** A content-language name in the UI locale ("Spanish" in English, "español" in Spanish). */
export function languageLabel(code: string, uiLocale: UiLocale, englishName?: string): string {
  if (uiLocale === "en") return englishName ?? languageName(code);
  try {
    const n = new Intl.DisplayNames([uiLocale === "es" ? "es-419" : uiLocale], { type: "language" }).of(code);
    if (n && n !== code) return n;
  } catch {
    /* fall through */
  }
  return englishName ?? languageName(code);
}

/**
 * "Translate to <my language>" for any generated content. Translation runs as a
 * background job (chunked + queued), so the button enqueues, then polls until the
 * result is cached and swaps the title/content in place. The reader can leave and
 * come back — the finished translation is waiting. Flipping back shows the
 * original at any time. All of this happens on the markdown source, never the
 * DOM, so it can't fight the browser translator or React.
 *
 * The account language wins: for a non-English account, content written in any
 * other language starts translating automatically on open (no click), and the
 * button then offers "Show original". English accounts keep the opt-in click.
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
  const autoKey = useRef(""); // which kind:id we already auto-started
  const { locale } = useI18n();

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

  const start = async (auto = false) => {
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
      // an automatic attempt that can't start (no AI configured, nothing to translate
      // yet) stays quiet and leaves the opt-in button; a click shows the error
      if (token.current === mine) setPhase(auto ? "idle" : "error");
    }
  };

  const toggle = async () => {
    if (on) { setOn(false); return; }
    if (data) { setOn(true); return; }
    await start();
  };

  // Account language wins: auto-translate once per piece of content for non-English
  // accounts. The server answers "same" when it's already in the reader's language.
  const hasContent = !!srcContent.trim();
  useEffect(() => {
    if (!myLang || myLang === "en" || !id || !hasContent) return;
    const key = `${kind}:${id}`;
    if (autoKey.current === key) return;
    autoKey.current = key;
    void start(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, myLang, hasContent]);

  return {
    myLangName: myLang ? languageLabel(myLang, locale) : "",
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
  t: ctl,
  className = "",
}: {
  t: ReturnType<typeof useContentTranslation>;
  className?: string;
}) {
  const { t } = useI18n();
  const label =
    ctl.phase === "working"
      ? ctl.ahead > 0
        ? t("Translating… {n} ahead", { n: ctl.ahead })
        : t("Translating…")
      : ctl.phase === "same"
        ? ctl.myLangName
          ? t("Already in {lang}", { lang: ctl.myLangName })
          : t("Already in your language")
        : ctl.phase === "error"
          ? t("Try again")
          : ctl.on
            ? t("Show original")
            : ctl.myLangName
              ? t("Translate to {lang}", { lang: ctl.myLangName })
              : t("Translate");
  return (
    <button
      onClick={ctl.toggle}
      disabled={ctl.phase === "working" || ctl.phase === "same"}
      title={
        ctl.phase === "working"
          ? t("Translating in the background — you can leave this page and come back")
          : ctl.on
            ? t("Show the original language")
            : t("Translate this into your language")
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60 ${
        ctl.on ? "bg-accent/12 text-accent" : "glassx text-ink"
      } ${className}`}
    >
      <GlobeIcon />
      {label}
    </button>
  );
}
