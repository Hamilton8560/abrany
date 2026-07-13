"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtClock, api } from "@/lib/client";
import { PlayIcon, PauseIcon, ResetIcon, CheckIcon } from "@/components/icons";
import type { Goal } from "@/lib/repo";

type Mode = "focus" | "break";
const PRESETS = [15, 25, 45, 50];
const STORE_KEY = "abrany.timer.v1";

/**
 * Wall-clock timer, not a counter. The countdown is derived from an absolute
 * end timestamp, so background-tab interval throttling can never make it drift
 * or "go inactive" — every render just re-reads the clock. State is mirrored to
 * localStorage so a reload (or returning after the block ended) resumes exactly.
 */
export default function PomodoroTimer({ onLogged }: { onLogged?: () => void }) {
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [mode, setMode] = useState<Mode>("focus");
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(25 * 60);
  const [elapsed, setElapsed] = useState(0); // actual focus seconds accrued this block
  const [recording, setRecording] = useState(false);

  const totalFor = useCallback(
    (m: Mode) => (m === "focus" ? focusMin : breakMin) * 60,
    [focusMin, breakMin],
  );

  // running-block timing lives in refs (wall-clock ms), not in the render loop.
  const endAtRef = useRef<number | null>(null); // when the current block ends
  const focusAccumRef = useRef(0); // focus seconds banked from prior running segments
  const focusStartRef = useRef<number | null>(null); // ms the current focus segment began

  const save = useCallback(
    (patch: Record<string, unknown> = {}) => {
      try {
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({
            mode,
            focusMin,
            breakMin,
            running,
            left,
            endAt: endAtRef.current,
            focusAccum: focusAccumRef.current,
            focusStart: focusStartRef.current,
            ...patch,
          }),
        );
      } catch {
        /* storage unavailable — timer still works, just won't survive reload */
      }
    },
    [mode, focusMin, breakMin, running, left],
  );

  const foldFocus = (now: number) => {
    if (focusStartRef.current != null) {
      focusAccumRef.current += Math.floor((now - focusStartRef.current) / 1000);
      focusStartRef.current = null;
    }
  };

  const finish = useCallback(() => {
    foldFocus(Date.now());
    endAtRef.current = null;
    setRunning(false);
    setLeft(0);
    if (mode === "focus") {
      setElapsed(focusAccumRef.current);
      setRecording(true); // prompt to log what you did
    }
    save({ running: false, endAt: null, left: 0 });
  }, [mode, save]);

  // Derive the display from the wall clock; also fires on tab refocus.
  const recompute = useCallback(() => {
    if (!running || endAtRef.current == null) return;
    const now = Date.now();
    const l = Math.max(0, Math.round((endAtRef.current - now) / 1000));
    setLeft(l);
    if (mode === "focus" && focusStartRef.current != null) {
      setElapsed(focusAccumRef.current + Math.floor((now - focusStartRef.current) / 1000));
    }
    if (l <= 0) finish();
  }, [running, mode, finish]);

  useEffect(() => {
    if (!running) return;
    recompute();
    const id = setInterval(recompute, 500);
    const onVisible = () => {
      if (!document.hidden) recompute();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [running, recompute]);

  // Rehydrate on mount: resume a running block, or recover one that ended while away.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as {
        mode?: Mode; focusMin?: number; breakMin?: number; running?: boolean;
        left?: number; endAt?: number | null; focusAccum?: number; focusStart?: number | null;
      };
      const m: Mode = s.mode === "break" ? "break" : "focus";
      setMode(m);
      if (typeof s.focusMin === "number") setFocusMin(s.focusMin);
      if (typeof s.breakMin === "number") setBreakMin(s.breakMin);
      focusAccumRef.current = s.focusAccum || 0;
      const now = Date.now();
      if (s.running && s.endAt && s.endAt > now) {
        endAtRef.current = s.endAt;
        focusStartRef.current = m === "focus" ? s.focusStart ?? now : null;
        setLeft(Math.round((s.endAt - now) / 1000));
        setRunning(true);
      } else if (s.running && s.endAt && s.endAt <= now) {
        // the block completed while the tab was closed/backgrounded
        if (m === "focus" && s.focusStart) {
          focusAccumRef.current += Math.floor((s.endAt - s.focusStart) / 1000);
          setElapsed(focusAccumRef.current);
          setRecording(true);
        }
        setLeft(0);
      } else {
        setElapsed(focusAccumRef.current);
        if (typeof s.left === "number") setLeft(s.left);
      }
    } catch {
      /* corrupt state — ignore and start fresh */
    }
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    const base = left > 0 ? left : totalFor(mode);
    const now = Date.now();
    endAtRef.current = now + base * 1000;
    if (mode === "focus") focusStartRef.current = now;
    setLeft(base);
    setRunning(true);
    save({ running: true, endAt: endAtRef.current, left: base, focusStart: focusStartRef.current });
  };
  const pause = () => {
    foldFocus(Date.now());
    endAtRef.current = null;
    setRunning(false);
    save({ running: false, endAt: null, focusStart: null });
  };
  const reset = () => {
    endAtRef.current = null;
    focusStartRef.current = null;
    focusAccumRef.current = 0;
    setRunning(false);
    setElapsed(0);
    setLeft(totalFor(mode));
    save({ running: false, endAt: null, left: totalFor(mode), focusAccum: 0, focusStart: null });
  };
  const switchMode = (m: Mode) => {
    endAtRef.current = null;
    focusStartRef.current = null;
    focusAccumRef.current = 0;
    setRunning(false);
    setMode(m);
    setElapsed(0);
    setLeft(totalFor(m));
    save({ mode: m, running: false, endAt: null, left: totalFor(m), focusAccum: 0, focusStart: null });
  };
  const setDuration = (minutes: number) => {
    if (mode === "focus") setFocusMin(minutes);
    else setBreakMin(minutes);
    if (!running) {
      setLeft(minutes * 60);
      save({ [mode === "focus" ? "focusMin" : "breakMin"]: minutes, left: minutes * 60 });
    }
  };

  const total = totalFor(mode);
  const pct = total > 0 ? 1 - left / total : 0;

  // progress ring geometry
  const R = 132;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* mode toggle */}
      <div className="glassx flex rounded-full p-1">
        {(["focus", "break"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`rounded-full px-5 py-1.5 text-[13px] font-semibold capitalize transition-all ${
              mode === m ? "glassx-dark text-white" : "text-muted hover:text-ink"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* ring + clock */}
      <div className="relative grid aspect-square w-full max-w-[300px] place-items-center">
        <svg viewBox="0 0 300 300" className="h-full w-full -rotate-90">
          <circle cx="150" cy="150" r={R} fill="none" stroke="var(--color-line)" strokeWidth="10" />
          <circle
            cx="150"
            cy="150"
            r={R}
            fill="none"
            stroke={mode === "focus" ? "var(--color-accent)" : "var(--color-up)"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${C * pct} ${C}`}
            style={{ transition: "stroke-dasharray 0.9s linear" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center">
            <span className="font-display text-[clamp(46px,16vw,64px)] font-extrabold tabular-nums leading-none text-ink">
              {fmtClock(left)}
            </span>
            <span
              className="mt-2 text-[11px] font-medium text-muted"
              style={{ letterSpacing: "1.8px" }}
            >
              {mode === "focus" ? "STAY FOCUSED" : "TAKE A BREAK"}
            </span>
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          aria-label="Reset"
          className="glassx grid size-12 place-items-center rounded-full text-ink transition-transform hover:-translate-y-0.5"
        >
          <ResetIcon className="size-5" />
        </button>
        <button
          type="button"
          onClick={running ? pause : start}
          className="glassx-dark grid size-16 place-items-center rounded-full text-white shadow-[var(--shadow-glow)] transition-transform hover:scale-105"
          aria-label={running ? "Pause" : "Start"}
        >
          {running ? <PauseIcon className="size-7" /> : <PlayIcon className="ml-1 size-6" />}
        </button>
        <button
          type="button"
          onClick={() => setRecording(true)}
          aria-label="Log a session now"
          className="glassx grid size-12 place-items-center rounded-full text-ink transition-transform hover:-translate-y-0.5"
          title="Log what you did"
        >
          <CheckIcon className="size-5" />
        </button>
      </div>

      {/* duration presets (only when idle) */}
      {!running && !recording && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted">
            {mode} length
          </span>
          <div className="flex gap-2">
            {PRESETS.map((p) => {
              const cur = mode === "focus" ? focusMin : breakMin;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDuration(p)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium transition-all ${
                    cur === p ? "bg-ink text-white" : "glassx text-muted hover:text-ink"
                  }`}
                >
                  {p}m
                </button>
              );
            })}
          </div>
        </div>
      )}

      {recording && (
        <SessionRecorder
          suggestedSec={mode === "focus" ? elapsed || focusMin * 60 : elapsed}
          onClose={() => setRecording(false)}
          onSaved={() => {
            setRecording(false);
            setElapsed(0);
            // after a focus block, roll into a break
            if (mode === "focus") switchMode("break");
            onLogged?.();
          }}
        />
      )}
    </div>
  );
}

/* ── recorder modal ─────────────────────────────────────────── */

function SessionRecorder({
  suggestedSec,
  onClose,
  onSaved,
}: {
  suggestedSec: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState(Math.max(1, Math.round(suggestedSec / 60)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ goals: Goal[] }>("/api/goals")
      .then((d) => setGoals(d.goals))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          durationSec: minutes * 60,
          notes,
          goalId: goalId ? Number(goalId) : null,
          mode: "focus",
        }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-[440px] rounded-[var(--radius-card-lg)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[22px] font-extrabold uppercase text-ink">
          Record session
        </h3>
        <p className="mt-1 text-[13px] text-muted">What did you work on? Keep the record honest.</p>

        <label className="mt-5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
          What I did
        </label>
        <textarea
          autoFocus
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="e.g. Worked through 12 Spanish flashcards + read one news article aloud."
          className="mt-2 w-full resize-none rounded-[14px] border border-line bg-white/70 px-3.5 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
        />

        <div className="mt-4 flex gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Goal
            </label>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="mt-2 w-full rounded-[14px] border border-line bg-white/70 px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent/50"
            >
              <option value="">No goal</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[110px]">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Minutes
            </label>
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
              className="mt-2 w-full rounded-[14px] border border-line bg-white/70 px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent/50"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-[12px] text-accent">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !notes.trim()}
            className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save session"}
          </button>
        </div>
      </div>
    </div>
  );
}
