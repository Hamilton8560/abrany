"use client";

import { useState } from "react";

/** Shown across the top while the owner is acting as another user. */
export default function ImpersonationBanner({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const stop = async () => {
    setBusy(true);
    await fetch("/api/admin/impersonate", { method: "DELETE" }).catch(() => {});
    window.location.href = "/app/settings";
  };
  return (
    <div className="sticky top-0 z-[60] flex items-center justify-between gap-3 bg-accent px-4 py-2 text-white print:hidden">
      <p className="min-w-0 truncate text-[12.5px] font-semibold">
        Acting as {email} — anything you create is saved to their account.
      </p>
      <button
        onClick={stop}
        disabled={busy}
        className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-[12px] font-semibold hover:bg-white/30 disabled:opacity-60"
      >
        {busy ? "Stopping…" : "Stop"}
      </button>
    </div>
  );
}
