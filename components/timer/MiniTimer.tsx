"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { formatMs, useTimer } from "./TimerProvider";
import TimerRing from "./TimerRing";
import { BrainGlyph, PauseIcon, PlayIcon, XIcon } from "../icons";

/* ───────────────────────────────────────────────────────────
   MiniTimer — the small companion widget. Lives in the root
   layout so it rides along on every page while a session is
   active. Hidden on /focus, where the full timer is on show.
   ─────────────────────────────────────────────────────────── */

export default function MiniTimer() {
  const t = useTimer();
  const pathname = usePathname();

  const visible = t.hydrated && t.status !== "idle" && pathname !== "/focus";
  const isBreak = t.phase === "break";
  const color = isBreak ? "var(--color-up)" : "var(--color-accent)";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.92 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-5 right-5 z-[60]"
        >
          {t.status === "done" ? (
            <div
              className="glassx flex items-center gap-3 rounded-[20px] py-3 pl-4 pr-3"
              style={{ boxShadow: "var(--shadow-glow)" }}
              role="alert"
            >
              <span
                className="anim-glow grid size-9 shrink-0 place-items-center rounded-full text-white"
                style={{ background: color }}
              >
                <BrainGlyph className="size-4" />
              </span>
              <div className="leading-tight">
                <p className="text-[13px] font-semibold text-ink">
                  {isBreak ? "Break over!" : "Focus complete!"}
                </p>
                <p className="text-[11px] text-muted">
                  {isBreak
                    ? "Ready for another round?"
                    : `Time for a ${t.breakMin}-min break`}
                </p>
              </div>
              <button
                type="button"
                onClick={isBreak ? t.startFocus : t.startBreak}
                className="ml-1 rounded-full bg-ink px-[14px] py-2 text-[12px] font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5"
              >
                {isBreak ? "Start focus" : "Start break"}
              </button>
              <button
                type="button"
                onClick={t.stop}
                aria-label="Dismiss timer"
                className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-ink"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ) : (
            <div className="glassx flex items-center gap-3 rounded-full py-2 pl-2 pr-2 shadow-[var(--shadow-cta)]">
              <Link
                href="/focus"
                aria-label="Open focus timer"
                className="relative grid place-items-center transition-transform duration-200 hover:scale-105"
              >
                <TimerRing size={40} stroke={3.5} fraction={1 - t.progress} color={color} />
                <BrainGlyph className="absolute size-4 text-ink/80" />
              </Link>
              <div className="min-w-[52px] leading-none">
                <p className="text-[15px] font-semibold tabular-nums text-ink">
                  {formatMs(t.remaining)}
                </p>
                <p
                  className="mt-[3px] text-[9px] font-semibold uppercase text-muted"
                  style={{ letterSpacing: "1.2px" }}
                >
                  {t.status === "paused" ? "Paused" : isBreak ? "Break" : "Focus"}
                </p>
              </div>
              <button
                type="button"
                onClick={t.status === "paused" ? t.resume : t.pause}
                aria-label={t.status === "paused" ? "Resume timer" : "Pause timer"}
                className="glassx grid size-8 place-items-center rounded-full text-ink transition-transform duration-200 hover:scale-105"
              >
                {t.status === "paused" ? (
                  <PlayIcon className="ml-[2px] h-3 w-[11px]" />
                ) : (
                  <PauseIcon className="size-3" />
                )}
              </button>
              <button
                type="button"
                onClick={t.stop}
                aria-label="End session"
                className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:text-ink"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
