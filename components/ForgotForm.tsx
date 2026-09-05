"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Nav";
import { BrainGlyph } from "@/components/icons";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error — try again");
    } finally {
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
              <h1 className="font-display text-[24px] font-extrabold uppercase text-ink">Reset your password</h1>
              <p className="mt-1 text-[13px] text-muted">
                {sent
                  ? "If that email has an account, a reset link is on its way. It works once and expires in 7 days."
                  : "Enter your email and we'll send you a single-use link to set a new password."}
              </p>
            </div>
          </div>

          {!sent && (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
                autoFocus
                className="w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
              />
              {error && <p className="text-[12.5px] text-accent">{error}</p>}
              <button
                type="submit"
                disabled={busy || !email}
                className="glassx-dark mt-1 rounded-full px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Sending…" : "Email me a reset link"}
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-[13px] text-muted">
            <Link href="/login" className="font-semibold text-accent">
              Back to sign in
            </Link>
          </p>
          <p className="mt-3 text-center text-[11.5px] text-muted/80">
            Signed up by your employer and never got the email? Your training admin can also send you a link from their Team page.
          </p>
        </div>
      </div>
    </main>
  );
}
