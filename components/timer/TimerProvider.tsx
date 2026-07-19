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

/* ───────────────────────────────────────────────────────────
   Global focus/break timer.

   State is anchored to an absolute wall-clock deadline
   (`endsAt`) rather than a decrementing counter, so the
   countdown survives route changes, tab throttling and full
   page reloads. Every change is mirrored to localStorage and
   synced across tabs via the `storage` event.
   ─────────────────────────────────────────────────────────── */

export type Phase = "focus" | "break";
export type TimerStatus = "idle" | "running" | "paused" | "done";

export interface TimerState {
  status: TimerStatus;
  phase: Phase;
  durationMs: number;
  /** wall-clock deadline while running */
  endsAt: number | null;
  /** frozen remainder while paused */
  remainingMs: number;
  focusMin: number;
  breakMin: number;
}

const STORAGE_KEY = "abrany.timer.v1";

const DEFAULT_STATE: TimerState = {
  status: "idle",
  phase: "focus",
  durationMs: 25 * 60_000,
  endsAt: null,
  remainingMs: 25 * 60_000,
  focusMin: 25,
  breakMin: 5,
};

export function formatMs(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* a running timer restored from storage may already be over */
function sanitize(raw: unknown): TimerState {
  if (typeof raw !== "object" || raw === null) return DEFAULT_STATE;
  const s = { ...DEFAULT_STATE, ...(raw as Partial<TimerState>) };
  if (s.status === "running") {
    if (typeof s.endsAt !== "number" || !Number.isFinite(s.endsAt)) {
      return { ...s, status: "idle", endsAt: null };
    }
    if (s.endsAt <= Date.now()) {
      return { ...s, status: "done", endsAt: null, remainingMs: 0 };
    }
  }
  return s;
}

/* ── completion chime (Web Audio, no asset needed) ─────────
   The AudioContext is created inside the user gesture that
   starts a timer, so playback is allowed when it later fires. */
let audioCtx: AudioContext | null = null;

function ensureAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* no audio available — the visual alert still shows */
  }
}

function playChime() {
  const ctx = audioCtx;
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    // bright ascending arpeggio: A5 → D6 → G6
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

interface TimerApi extends TimerState {
  /** false until state has been restored from localStorage */
  hydrated: boolean;
  /** live remaining time in ms */
  remaining: number;
  /** elapsed fraction of the current phase, 0..1 */
  progress: number;
  startFocus: () => void;
  startBreak: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setFocusMin: (min: number) => void;
  setBreakMin: (min: number) => void;
}

const TimerContext = createContext<TimerApi | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  // server + first client render agree on DEFAULT_STATE; localStorage is
  // restored in an effect to avoid hydration mismatches
  const [state, setState] = useState<TimerState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const baseTitle = useRef("");

  useEffect(() => {
    baseTitle.current = document.title;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(sanitize(JSON.parse(raw)));
    } catch {
      /* corrupted storage — start fresh */
    }
    setHydrated(true);
  }, []);

  // persist every change
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  // keep tabs in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        setState(sanitize(JSON.parse(e.newValue)));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // tick while running; fire completion exactly once per deadline
  useEffect(() => {
    if (state.status !== "running" || state.endsAt === null) return;
    const endsAt = state.endsAt;
    const phase = state.phase;
    const tick = () => {
      if (endsAt - Date.now() <= 0) {
        setState((s) =>
          s.status === "running" && s.endsAt === endsAt
            ? { ...s, status: "done", endsAt: null, remainingMs: 0 }
            : s,
        );
        playChime();
        notifyDone(phase);
      } else {
        setNow(Date.now());
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.status, state.endsAt, state.phase]);

  const remaining =
    state.status === "running" && state.endsAt !== null
      ? Math.max(0, state.endsAt - now)
      : state.remainingMs;
  const progress =
    state.durationMs > 0 ? Math.min(1, 1 - remaining / state.durationMs) : 0;

  // countdown in the tab title so a backgrounded tab still shows progress
  const remainingLabel = formatMs(remaining);
  useEffect(() => {
    if (!hydrated) return;
    if (state.status === "running" || state.status === "paused") {
      const label = state.phase === "focus" ? "Focus" : "Break";
      document.title = `${remainingLabel} ${
        state.status === "paused" ? "⏸" : "·"
      } ${label} — Abrany`;
    } else if (state.status === "done") {
      document.title =
        state.phase === "focus"
          ? "✓ Focus done — break time! · Abrany"
          : "✓ Break over · Abrany";
    } else {
      document.title = baseTitle.current || document.title;
    }
  }, [hydrated, state.status, state.phase, remainingLabel]);

  const start = useCallback((phase: Phase) => {
    ensureAudio();
    try {
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* ignore */
    }
    setState((s) => {
      const durationMs =
        (phase === "focus" ? s.focusMin : s.breakMin) * 60_000;
      return {
        ...s,
        status: "running",
        phase,
        durationMs,
        endsAt: Date.now() + durationMs,
        remainingMs: durationMs,
      };
    });
  }, []);

  const startFocus = useCallback(() => start("focus"), [start]);
  const startBreak = useCallback(() => start("break"), [start]);

  const pause = useCallback(() => {
    setState((s) =>
      s.status === "running" && s.endsAt !== null
        ? {
            ...s,
            status: "paused",
            remainingMs: Math.max(0, s.endsAt - Date.now()),
            endsAt: null,
          }
        : s,
    );
  }, []);

  const resume = useCallback(() => {
    ensureAudio();
    setState((s) =>
      s.status === "paused"
        ? { ...s, status: "running", endsAt: Date.now() + s.remainingMs }
        : s,
    );
  }, []);

  const stop = useCallback(() => {
    setState((s) => ({
      ...s,
      status: "idle",
      endsAt: null,
      remainingMs: s.focusMin * 60_000,
      durationMs: s.focusMin * 60_000,
      phase: "focus",
    }));
  }, []);

  const setFocusMin = useCallback((min: number) => {
    setState((s) => ({
      ...s,
      focusMin: min,
      ...(s.status === "idle"
        ? { durationMs: min * 60_000, remainingMs: min * 60_000 }
        : {}),
    }));
  }, []);

  const setBreakMin = useCallback((min: number) => {
    setState((s) => ({ ...s, breakMin: min }));
  }, []);

  return (
    <TimerContext.Provider
      value={{
        ...state,
        hydrated,
        remaining,
        progress,
        startFocus,
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
