"use client";

import { useEffect, useRef } from "react";
import { useTimer } from "@/components/timer/TimerProvider";
import { useReadingActivity } from "./ReadingActivityContext";
import { api } from "@/lib/client";

/* ───────────────────────────────────────────────────────────
   Bridges the (localStorage-only) global timer back into the
   training record. When a FOCUS block completes it logs one
   session to /api/sessions:

     • reading activity attached → mode='reading'  → Temporal XP
     • otherwise                → mode='focus'     → Prefrontal XP

   Without this, completed blocks on the new TimerProvider earn no
   XP and never appear in the Training Log. Mount it once, inside
   both <TimerProvider> and <ReadingActivityProvider>:

     <TimerProvider>
       <ReadingActivityProvider>
         <TimerSessionBridge onLogged={refresh} />
         {app}
       </ReadingActivityProvider>
     </TimerProvider>
   ─────────────────────────────────────────────────────────── */

export default function TimerSessionBridge({ onLogged }: { onLogged?: () => void }) {
  const { status, phase, durationMs } = useTimer();
  const { activity, clear } = useReadingActivity();
  // guards against double-logging one completion (effect re-runs, StrictMode)
  const loggedRef = useRef(false);

  useEffect(() => {
    if (status !== "done") {
      loggedRef.current = false; // armed again for the next completion
      return;
    }
    if (loggedRef.current || phase !== "focus") return; // breaks aren't training
    loggedRef.current = true;

    const reading = activity?.kind === "reading";
    const body = reading
      ? {
          mode: "reading" as const,
          durationSec: Math.round(durationMs / 1000),
          bookId: activity.bookId ?? null,
          chapterId: activity.chapterId ?? null,
          tags: activity.title ?? "",
        }
      : { mode: "focus" as const, durationSec: Math.round(durationMs / 1000) };

    api("/api/sessions", { method: "POST", body: JSON.stringify(body) })
      .then(() => {
        if (reading) clear();
        onLogged?.();
        // let any open page (dashboard, log) refresh its session list
        window.dispatchEvent(new Event("abrany:session-logged"));
      })
      .catch(() => {
        loggedRef.current = false; // let it retry on the next tick
      });
  }, [status, phase, durationMs, activity, clear, onLogged]);

  return null;
}
