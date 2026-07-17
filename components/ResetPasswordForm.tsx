"use client";

import { useState } from "react";
import { Logo } from "@/components/Nav";
import { BrainGlyph } from "@/components/icons";

export default function ResetPasswordForm({ required }: { required: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setBusy(false);
        return;
      }
      window.location.href = "/app";
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="glass rounded-[var(--radius-card-lg)] p-7">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <span className="glassx-dark grid size-12 place-items-center rounded-full text-white">
              <BrainGlyph className="size-6" />
            </span>
            <div>
              <h1 className="font-display text-[24px] font-extrabold uppercase text-ink">
                Set your password
              </h1>
              <p className="mt-1 text-[13px] text-muted">
                {required
                  ? "You logged in with a temporary password — choose your own to continue."
                  : "Choose a new password for your account."}
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (8+ characters)"
              autoComplete="new-password"
              autoFocus
              className="w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
            />
            {error && <p className="text-[12.5px] text-accent">{error}</p>}
            <button
              type="submit"
              disabled={busy || !password || !confirm}
              className="glassx-dark mt-1 rounded-full px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Set password & continue"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
