"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CoachChat from "@/components/app/CoachChat";
import MemoryPanel from "@/components/app/MemoryPanel";
import { api } from "@/lib/client";
import type { PublicUser } from "@/lib/user";
import { useT } from "@/lib/i18n/client";

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
  const t = useT();
  const [label, setLabel] = useState(t("AI COACH"));
  useEffect(() => {
    api<{ user: PublicUser }>("/api/auth/me")
      .then((d) => {
        const u = d.user;
        if (!u) return;
        if (u.isOwner) setLabel(t("AI COACH · BUILT-IN"));
        else if (u.hasKey) setLabel(t("AI COACH · {provider}", { provider: PROVIDER_LABEL[u.provider] ?? u.provider.toUpperCase() }));
        else if (u.orgAi) setLabel(t("AI COACH · YOUR COMPANY'S AI"));
        else if (u.freeAiAccess) setLabel(t("AI COACH · SHARED AI"));
        else setLabel(t("AI COACH · ADD A KEY IN SETTINGS"));
      })
      .catch(() => {});
  }, [t]);
  return label;
}

export default function CoachPage() {
  const label = useAiLabel();
  const t = useT();
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
      <Suspense fallback={<p className="text-[14px] text-muted">{t("Loading coach…")}</p>}>
        <CoachInner />
      </Suspense>
    </div>
  );
}
