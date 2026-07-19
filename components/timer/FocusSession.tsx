"use client";

import { motion, type Variants } from "motion/react";
import { formatMs, useTimer } from "./TimerProvider";
import TimerRing from "./TimerRing";
import { BrainGlyph, PauseIcon, PlayIcon } from "../icons";
import LiquidGlass from "../LiquidGlass";

const FOCUS_PRESETS = [15, 25, 45, 60];
const BREAK_PRESETS = [5, 10, 15];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

function PresetRow({
  label,
  presets,
  value,
  onSelect,
  disabled,
}: {
  label: string;
  presets: number[];
  value: number;
  onSelect: (min: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className="text-[10px] font-semibold uppercase text-muted"
        style={{ letterSpacing: "1.5px" }}
      >
        {label}
      </span>
      <div className="flex gap-2">
        {presets.map((min) => (
          <button
            key={min}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(min)}
            className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-all duration-200 disabled:opacity-40 ${
              value === min
                ? "bg-ink text-white shadow-[var(--shadow-cta)]"
                : "glassx text-ink hover:-translate-y-0.5"
            }`}
          >
            {min} min
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FocusSession() {
  const t = useTimer();

  const isBreak = t.phase === "break";
  const color = isBreak ? "var(--color-up)" : "var(--color-accent)";
  const idle = t.status === "idle";
  const running = t.status === "running";
  const paused = t.status === "paused";
  const done = t.status === "done";

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-[110px]">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex w-full max-w-[520px] flex-col items-center gap-7"
      >
        {/* eyebrow */}
        <motion.div variants={rise} className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span
            className="text-[12px] font-medium text-accent"
            style={{ letterSpacing: "1.68px" }}
          >
            FOCUS TRAINING
          </span>
        </motion.div>

        <motion.h1
          variants={rise}
          className="text-center font-display font-extrabold uppercase text-ink [font-size:clamp(34px,6vw,48px)] [line-height:0.98] [letter-spacing:-0.01em]"
        >
          {done
            ? isBreak
              ? "Break over"
              : "Session complete"
            : isBreak && !idle
              ? "Recharge"
              : "Deep Focus"}
        </motion.h1>

        {/* the big ring */}
        <motion.div variants={rise}>
          <LiquidGlass
            radius={150}
            bezel={22}
            scale={30}
            className="grid size-[300px] place-items-center rounded-full"
          >
            <div className="relative grid place-items-center p-5">
              <TimerRing
                size={250}
                stroke={10}
                fraction={idle ? 1 : 1 - t.progress}
                color={color}
                track="rgba(27, 36, 54, 0.1)"
              />
              <div className="absolute flex flex-col items-center leading-none">
                <span className="text-[52px] font-semibold tabular-nums text-ink">
                  {formatMs(idle ? t.focusMin * 60_000 : t.remaining)}
                </span>
                <span
                  className="mt-2 text-[11px] font-semibold uppercase text-muted"
                  style={{ letterSpacing: "1.8px" }}
                >
                  {paused
                    ? "Paused"
                    : done
                      ? isBreak
                        ? "Break done"
                        : "Focus done"
                      : isBreak && !idle
                        ? "Break"
                        : "Focus"}
                </span>
              </div>
            </div>
          </LiquidGlass>
        </motion.div>

        {/* controls */}
        <motion.div variants={rise} className="flex flex-col items-center gap-5">
          {idle && (
            <>
              <PresetRow
                label="Focus length"
                presets={FOCUS_PRESETS}
                value={t.focusMin}
                onSelect={t.setFocusMin}
                disabled={false}
              />
              <PresetRow
                label="Break length"
                presets={BREAK_PRESETS}
                value={t.breakMin}
                onSelect={t.setBreakMin}
                disabled={false}
              />
              <button
                type="button"
                onClick={t.startFocus}
                className="glassx group mt-1 inline-flex items-center gap-[14px] rounded-full py-[7px] pl-[7px] pr-[24px] shadow-[var(--shadow-cta)] transition-transform duration-300 hover:-translate-y-0.5"
              >
                <span className="glassx-dark grid size-[42px] place-items-center rounded-full text-white">
                  <BrainGlyph className="size-[18px]" />
                </span>
                <span className="text-[15px] font-semibold text-ink">
                  Start Focus
                </span>
              </button>
            </>
          )}

          {(running || paused) && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={paused ? t.resume : t.pause}
                className="glassx inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-ink shadow-[var(--shadow-cta)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                {paused ? (
                  <>
                    <PlayIcon className="h-3 w-[11px]" /> Resume
                  </>
                ) : (
                  <>
                    <PauseIcon className="size-3" /> Pause
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={t.stop}
                className="rounded-full px-5 py-3 text-[14px] font-semibold text-muted transition-colors hover:text-ink"
              >
                End session
              </button>
            </div>
          )}

          {done && (
            <div className="flex flex-col items-center gap-4">
              <p className="max-w-[320px] text-center text-[14px] leading-[1.6] text-muted">
                {isBreak
                  ? "Recharged and ready. Jump back into a focus session."
                  : `Nice work. Give your mind ${t.breakMin} minutes to consolidate.`}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={isBreak ? t.startFocus : t.startBreak}
                  className="rounded-full bg-ink px-7 py-[13px] text-[14px] font-semibold text-white shadow-[var(--shadow-cta)] transition-transform duration-200 hover:-translate-y-0.5"
                >
                  {isBreak ? "Start focus" : `Start ${t.breakMin}-min break`}
                </button>
                <button
                  type="button"
                  onClick={t.stop}
                  className="rounded-full px-4 py-3 text-[14px] font-semibold text-muted transition-colors hover:text-ink"
                >
                  Done for now
                </button>
              </div>
            </div>
          )}
        </motion.div>

        <motion.p
          variants={rise}
          className="max-w-[340px] text-center text-[12.5px] leading-[1.6] text-muted"
        >
          Your timer keeps running as you browse — a mini widget follows you on
          every page and lets you start your break the moment time is up.
        </motion.p>
      </motion.div>
    </section>
  );
}
