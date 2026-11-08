"use client";

import PomodoroTimer from "@/components/app/PomodoroTimer";
import { useT } from "@/lib/i18n/client";

export default function TimerPage() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-8">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            {t("FOCUS TIMER")}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(30px,4vw,42px)] font-extrabold uppercase leading-[0.98] text-ink">
          {t("One block at a time")}
        </h1>
      </header>

      <section className="glass rounded-[var(--radius-card-lg)] p-6 sm:p-10">
        <PomodoroTimer />
      </section>
    </div>
  );
}
