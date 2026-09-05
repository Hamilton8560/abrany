"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CoachChat from "@/components/app/CoachChat";
import MemoryPanel from "@/components/app/MemoryPanel";
import { api } from "@/lib/client";
import type { PublicUser } from "@/lib/user";

function CoachInner() {
  const params = useSearchParams();
  const goal = params.get("goal");
  const guide = params.get("guide");
  const lesson = params.get("lesson");
  return (
    <CoachChat
      goalId={goal ? Number(goal) : undefined}
      studyGuideId={guide ? Number(guide) : undefined}
      lessonId={lesson ? Number(lesson) : undefined}
    />
  );
}

const PROVIDER_LABEL: Record<string, string> = {
  minimax: "MiniMax",
  kimi: "Kimi",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  anthropic: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
};

/** "AI COACH · <who powers it>" — no longer hardcoded to one vendor. */
function useAiLabel(): string {
  const [label, setLabel] = useState("AI COACH");
  useEffect(() => {
    api<{ user: PublicUser }>("/api/auth/me")
      .then((d) => {
        const u = d.user;
        if (!u) return;
        if (u.isOwner) setLabel("AI COACH · BUILT-IN");
        else if (u.hasKey) setLabel(`AI COACH · ${PROVIDER_LABEL[u.provider] ?? u.provider.toUpperCase()}`);
        else if (u.orgAi) setLabel("AI COACH · YOUR COMPANY'S AI");
        else if (u.freeAiAccess) setLabel("AI COACH · SHARED AI");
        else setLabel("AI COACH · ADD A KEY IN SETTINGS");
      })
      .catch(() => {});
  }, []);
  return label;
}

export default function CoachPage() {
  const label = useAiLabel();
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            {label}
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
