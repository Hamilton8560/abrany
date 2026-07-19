"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/client";

/* ───────────────────────────────────────────────────────────
   Global focus/break timer — SERVER-authoritative.

   The live timer lives in the `timer_states` table (one row per
   user) behind /api/timer, and the countdown is derived from an
   absolute wall-clock deadline (`end_at`). Because the source of
   truth is the server, the timer:
     • survives route changes, reloads and tab throttling, and
     • syncs across every device the user is signed in on —
       start it on your phone, watch it finish on the web.

   Completion is finalized SERVER-SIDE: whichever GET first sees a
   passed deadline logs the session (reading → Temporal, else
   focus → Prefrontal) and returns justCompleted, so a block is
   logged exactly once no matter how many devices are open. A
   short poll adopts other devices' changes; a suppression window
   stops our own just-made change from being clobbered mid-flight.
   ─────────────────────────────────────────────────────────── */

export type Phase = "focus" | "break";
export type TimerStatus = "idle" | "running" | "paused" | "done";

/** what the reading nudge attaches to a focus block */
export interface TimerActivity {
  bookId?: number | null;
  chapterId?: number | null;
}

/** shape returned by /api/timer (subset we read) */
interface ServerTimer {
  mode: "focus" | "break";
  focus_min: number;
  break_min: number;
  running: number; // 0 | 1
  end_at: number | null; // epoch ms
  left_sec: number; // frozen remainder while paused; 0 once completed
}

interface LocalState {
  status: TimerStatus;
  phase: Phase;
  focusMin: number;
  breakMin: number;
  leftMs: number; // remaining ms (authoritative while not running)
}

const DEFAULT_STATE: LocalState = {
  status: "idle",
  phase: "focus",
  focusMin: 25,
  breakMin: 5,
  leftMs: 25 * 60_000,
};

const POLL_MS = 4000;
const SUPPRESS_MS = 1800;

export function formatMs(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const durationMsOf = (phase: Phase, focusMin: number, breakMin: number) =>
  (phase === "focus" ? focusMin : breakMin) * 60_000;

/* ── completion chime (Web Audio, no asset) ─────────────────
   AudioContext is created inside the user gesture that starts a
   timer, so playback is allowed when it later fires. */
let audioCtx: AudioContext | null = null;
function ensureAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* no audio — visual alert still shows */
  }
}
function playChime() {
  const ctx = audioCtx;
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    [880, 1174.66, 1567.98].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = t0 + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  } catch {
    /* ignore */
  }
}
function notifyDone(phase: Phase) {
  try {
    navigator.vibrate?.([180, 90, 180]);
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Abrany Timer", {
        body:
          phase === "focus"
            ? "Focus session complete — time for a break."
            : "Break's over — ready for another round of focus?",
        tag: "abrany-timer",
      });
    }
  } catch {
    /* ignore */
  }
}

interface TimerApi extends LocalState {
  hydrated: boolean;
  /** live remaining time in ms */
  remaining: number;
  /** full length of the current phase, ms */
  durationMs: number;
  /** elapsed fraction of the current phase, 0..1 */
  progress: number;
  startFocus: () => void;
  /** start a focus block tagged with a book/chapter → completed block logs as reading */
  startReading: (activity: TimerActivity) => void;
  startBreak: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setFocusMin: (min: number) => void;
  setBreakMin: (min: number) => void;
}

const TimerContext = createContext<TimerApi | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocalState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => 0);

  const endAtRef = useRef<number | null>(null); // ms deadline while running
  const suppressUntilRef = useRef(0); // ignore polls right after a local action
  const notifiedRef = useRef(true); // fire completion chime once per episode
  const activityRef = useRef<TimerActivity>({ bookId: null, chapterId: null });
  const baseTitle = useRef("");
  const suppress = () => (suppressUntilRef.current = Date.now() + SUPPRESS_MS);

  /* persist an intended state to the server (source of truth) */
  const persist = useCallback((s: LocalState, endsAt: number | null) => {
    const dur = durationMsOf(s.phase, s.focusMin, s.breakMin);
    void api("/api/timer", {
      method: "POST",
      body: JSON.stringify({
        mode: s.phase,
        focus_min: s.focusMin,
        break_min: s.breakMin,
        running: s.status === "running" ? 1 : 0,
        end_at: s.status === "running" ? endsAt : null,
        left_sec:
          s.status === "paused"
            ? Math.round(s.leftMs / 1000)
            : s.status === "done"
              ? 0
              : Math.round(dur / 1000),
        book_id: activityRef.current.bookId ?? null,
        chapter_id: activityRef.current.chapterId ?? null,
      }),
    }).catch(() => {});
  }, []);

  /* chime + OS notification once per completion */
  const chimeOnce = useCallback((phase: Phase) => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    playChime();
    notifyDone(phase);
  }, []);

  /* adopt a server snapshot (mount + poll → cross-device sync) */
  const applyServer = useCallback((t: ServerTimer) => {
    const phase: Phase = t.mode === "break" ? "break" : "focus";
    const focusMin = t.focus_min || 25;
    const breakMin = t.break_min || 5;
    const dur = durationMsOf(phase, focusMin, breakMin);
    const nowMs = Date.now();
    const base = { phase, focusMin, breakMin };

    if (t.running && t.end_at && t.end_at > nowMs) {
      endAtRef.current = t.end_at;
      notifiedRef.current = false; // a live block can still complete
      setState({ ...base, status: "running", leftMs: t.end_at - nowMs });
    } else if (t.left_sec <= 0 && !t.running) {
      // a completed (server-finalized) block
      endAtRef.current = null;
      setState({ ...base, status: "done", leftMs: 0 });
    } else if (t.left_sec * 1000 < dur) {
      endAtRef.current = null;
      setState({ ...base, status: "paused", leftMs: t.left_sec * 1000 });
    } else {
      endAtRef.current = null;
      setState({ ...base, status: "idle", leftMs: dur });
    }
  }, []);

  /* pull server state; the GET also finalizes a due block server-side */
  const pull = useCallback(
    (force = false) =>
      api<{ timer: ServerTimer; justCompleted?: boolean }>("/api/timer")
        .then((d) => {
          if (!force && Date.now() < suppressUntilRef.current) return;
          if (!d.timer) return;
          applyServer(d.timer);
          if (d.justCompleted) {
            chimeOnce(d.timer.mode === "break" ? "break" : "focus");
            activityRef.current = { bookId: null, chapterId: null };
            // let open pages (dashboard, log, mind) refresh their data
            window.dispatchEvent(new Event("abrany:session-logged"));
          }
          setHydrated(true);
        })
        .catch(() => setHydrated(true)),
    [applyServer, chimeOnce],
  );

  // mount: capture base title, then pull + poll
  useEffect(() => {
    baseTitle.current = document.title;
    let alive = true;
    const run = () => {
      if (alive) void pull();
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pull]);

  // tick while running; on reaching the deadline, let the server finalize
  useEffect(() => {
    if (state.status !== "running" || endAtRef.current == null) return;
    const tick = () => {
      const end = endAtRef.current;
      if (end == null) return;
      const left = end - Date.now();
      if (left <= 0) {
        endAtRef.current = null;
        setState((s) => (s.status === "running" ? { ...s, status: "done", leftMs: 0 } : s));
        chimeOnce(state.phase); // instant feedback on this device
        void pull(true); // server logs the session + returns justCompleted
      } else {
        setNow(Date.now());
        setState((s) => (s.status === "running" ? { ...s, leftMs: left } : s));
      }
    };
    tick();
    const id = setInterval(tick, 250);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [state.status, state.phase, chimeOnce, pull]);

  const durationMs = durationMsOf(state.phase, state.focusMin, state.breakMin);
  // `now` starts at 0 (stable SSR/first paint); once a running block is adopted
  // it's only read on the client, so fall back to the live clock for that frame
  const liveNow = now === 0 ? Date.now() : now;
  const remaining =
    state.status === "running" && endAtRef.current != null
      ? Math.max(0, endAtRef.current - liveNow)
      : state.leftMs;
  const progress = durationMs > 0 ? Math.min(1, 1 - remaining / durationMs) : 0;

  // countdown in the tab title so a backgrounded tab still shows progress
  const remainingLabel = formatMs(remaining);
  useEffect(() => {
    if (!hydrated) return;
    if (state.status === "running" || state.status === "paused") {
      const label = state.phase === "focus" ? "Focus" : "Break";
      document.title = `${remainingLabel} ${state.status === "paused" ? "⏸" : "·"} ${label} — Abrany`;
    } else if (state.status === "done") {
      document.title =
        state.phase === "focus" ? "✓ Focus done — break time! · Abrany" : "✓ Break over · Abrany";
    } else {
      document.title = baseTitle.current || document.title;
    }
  }, [hydrated, state.status, state.phase, remainingLabel]);

  const start = useCallback(
    (phase: Phase, activity?: TimerActivity) => {
      ensureAudio();
      try {
        if ("Notification" in window && Notification.permission === "default") {
          void Notification.requestPermission();
        }
      } catch {
        /* ignore */
      }
      activityRef.current =
        phase === "focus"
          ? { bookId: activity?.bookId ?? null, chapterId: activity?.chapterId ?? null }
          : { bookId: null, chapterId: null };
      setState((s) => {
        const dur = durationMsOf(phase, s.focusMin, s.breakMin);
        const endsAt = Date.now() + dur;
        endAtRef.current = endsAt;
        notifiedRef.current = false;
        const next: LocalState = { ...s, status: "running", phase, leftMs: dur };
        suppress();
        persist(next, endsAt);
        return next;
      });
    },
    [persist],
  );
  const startFocus = useCallback(() => start("focus"), [start]);
  const startReading = useCallback((activity: TimerActivity) => start("focus", activity), [start]);
  const startBreak = useCallback(() => start("break"), [start]);

  const pause = useCallback(() => {
    setState((s) => {
      if (s.status !== "running") return s;
      const leftMs = endAtRef.current ? Math.max(0, endAtRef.current - Date.now()) : s.leftMs;
      endAtRef.current = null;
      const next: LocalState = { ...s, status: "paused", leftMs };
      suppress();
      persist(next, null);
      return next;
    });
  }, [persist]);

  const resume = useCallback(() => {
    ensureAudio();
    setState((s) => {
      if (s.status !== "paused") return s;
      const endsAt = Date.now() + s.leftMs;
      endAtRef.current = endsAt;
      const next: LocalState = { ...s, status: "running" };
      suppress();
      persist(next, endsAt);
      return next;
    });
  }, [persist]);

  const stop = useCallback(() => {
    const wasActive = state.status === "running" || state.status === "paused";
    activityRef.current = { bookId: null, chapterId: null };
    endAtRef.current = null;
    notifiedRef.current = true;
    const next: LocalState = { ...state, status: "idle", phase: "focus", leftMs: state.focusMin * 60_000 };
    setState(next);
    suppress();
    if (wasActive) {
      // stopping an in-progress block: the server logs elapsed time if it's
      // worth keeping, then resets the row
      api<{ logged?: boolean }>("/api/timer/stop", { method: "POST" })
        .then((d) => {
          if (d?.logged) window.dispatchEvent(new Event("abrany:session-logged"));
        })
        .catch(() => {});
    } else {
      // dismissing a done/idle timer — nothing to log
      persist(next, null);
    }
  }, [state, persist]);

  const setFocusMin = useCallback(
    (min: number) => {
      setState((s) => {
        const next: LocalState = {
          ...s,
          focusMin: min,
          ...(s.status === "idle" && s.phase === "focus" ? { leftMs: min * 60_000 } : {}),
        };
        suppress();
        persist(next, null);
        return next;
      });
    },
    [persist],
  );

  const setBreakMin = useCallback(
    (min: number) => {
      setState((s) => {
        const next: LocalState = {
          ...s,
          breakMin: min,
          ...(s.status === "idle" && s.phase === "break" ? { leftMs: min * 60_000 } : {}),
        };
        suppress();
        persist(next, null);
        return next;
      });
    },
    [persist],
  );

  return (
    <TimerContext.Provider
      value={{
        ...state,
        hydrated,
        remaining,
        durationMs,
        progress,
        startFocus,
        startReading,
        startBreak,
        pause,
        resume,
        stop,
        setFocusMin,
        setBreakMin,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within <TimerProvider>");
  return ctx;
}
