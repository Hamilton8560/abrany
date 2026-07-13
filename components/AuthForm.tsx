"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Nav";
import { BrainGlyph } from "@/components/icons";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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

  const isLogin = mode === "login";

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
                {isLogin ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-1 text-[13px] text-muted">
                {isLogin ? "Sign in to keep training." : "Start training your mind."}
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              className="w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? "Password" : "Password (8+ characters)"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
            />
            {error && <p className="text-[12.5px] text-accent">{error}</p>}
            <button
              type="submit"
              disabled={busy || !email || !password}
              className="glassx-dark mt-1 rounded-full px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-muted">
            {isLogin ? "New here? " : "Already have an account? "}
            <Link href={isLogin ? "/signup" : "/login"} className="font-semibold text-accent">
              {isLogin ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </div>
        <p className="mt-4 text-center text-[11.5px] text-muted/80">
          You&apos;ll add your own AI key after signing up — free to use.
        </p>
      </div>
    </main>
  );
}
