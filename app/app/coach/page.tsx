"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CoachChat from "@/components/app/CoachChat";
import MemoryPanel from "@/components/app/MemoryPanel";

function CoachInner() {
  const params = useSearchParams();
  const goal = params.get("goal");
  const guide = params.get("guide");
  return (
    <CoachChat
      goalId={goal ? Number(goal) : undefined}
      studyGuideId={guide ? Number(guide) : undefined}
    />
  );
}

export default function CoachPage() {
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            AI COACH · MINIMAX M3
          </span>
        </div>
      </header>
      <MemoryPanel />
      <Suspense fallback={<p className="text-[14px] text-muted">Loading coach…</p>}>
        <CoachInner />
      </Suspense>
    </div>
  );
}
