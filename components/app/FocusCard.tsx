"use client";

import Link from "next/link";
import { formatMs, useTimer } from "@/components/timer/TimerProvider";
import TimerRing from "@/components/timer/TimerRing";
import { PlayIcon, PauseIcon, ResetIcon } from "@/components/icons";

const FOCUS_PRESETS = [15, 25, 45, 50];

/**
 * Compact dashboard control for the global timer. Reads/writes the same
 * `useTimer()` state as the full FocusSession and the floating MiniTimer, so
 * all three stay in sync. Completed blocks are logged by <TimerSessionBridge>.
 */
export default function FocusCard() {
  const t = useTimer();
  const isBreak = t.phase === "break";
  const color = isBreak ? "var(--color-up)" : "var(--color-accent)";
  const idle = t.status === "idle";
  const running = t.status === "running";
  const paused = t.status === "paused";

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative grid place-items-center">
        <TimerRing size={240} stroke={9} fraction={1 - t.progress} color={color} />
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center">
            <span className="font-display text-[clamp(40px,12vw,56px)] font-extrabold tabular-nums leading-none text-ink">
              {t.hydrated ? formatMs(t.remaining) : "—"}
            </span>
            <span
              className="mt-2 text-[11px] font-medium uppercase text-muted"
              style={{ letterSpacing: "1.8px" }}
            >
              {t.status === "done"
                ? isBreak
                  ? "Break over"
                  : "Session complete"
                : paused
                  ? "Paused"
                  : isBreak
                    ? "Take a break"
                    : "Deep focus"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={t.stop}
          aria-label="Reset"
          className="glassx grid size-12 place-items-center rounded-full text-ink transition-transform hover:-translate-y-0.5"
        >
          <ResetIcon className="size-5" />
        </button>
        <button
          type="button"
          onClick={
            running ? t.pause : paused ? t.resume : isBreak ? t.startBreak : t.startFocus
          }
          className="glassx-dark grid size-16 place-items-center rounded-full text-white shadow-[var(--shadow-glow)] transition-transform hover:scale-105"
          aria-label={running ? "Pause" : "Start"}
        >
          {running ? <PauseIcon className="size-7" /> : <PlayIcon className="ml-1 size-6" />}
        </button>
        <Link
          href="/app/timer"
          aria-label="Open full timer"
          className="glassx grid size-12 place-items-center rounded-full text-[11px] font-semibold text-muted transition-transform hover:-translate-y-0.5 hover:text-ink"
        >
          Full
        </Link>
      </div>

      {idle && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted">
            focus length
          </span>
          <div className="flex gap-2">
            {FOCUS_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => t.setFocusMin(m)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-all ${
                  t.focusMin === m ? "bg-ink text-white" : "glassx text-muted hover:text-ink"
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
