"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import QueueBadge from "@/components/app/QueueBadge";
import InstructorPanel from "@/components/app/InstructorPanel";
import OpenRouterModelPicker from "@/components/app/OpenRouterModelPicker";
import { LANGUAGES } from "@/lib/languages";
import type { PublicUser } from "@/lib/user";

type Meta = { label: string; keyUrl: string; modelHint: string; models?: string[] };
// Order = display order. The three "premium" providers come first.
const PROVIDERS: Record<string, Meta> = {
  anthropic: {
    label: "Claude",
    keyUrl: "https://console.anthropic.com/settings/keys",
    modelHint: "claude-sonnet-5",
    models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
  },
  openai: {
    label: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    modelHint: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3", "o4-mini"],
  },
  gemini: {
    label: "Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    modelHint: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro", "gemini-1.5-flash"],
  },
  openrouter: { label: "OpenRouter", keyUrl: "https://openrouter.ai/keys", modelHint: "deepseek/deepseek-chat" },
  deepseek: { label: "DeepSeek", keyUrl: "https://platform.deepseek.com", modelHint: "deepseek-chat", models: ["deepseek-chat", "deepseek-reasoner"] },
  minimax: { label: "MiniMax", keyUrl: "https://platform.minimax.io", modelHint: "MiniMax-M3", models: ["MiniMax-M3"] },
  kimi: { label: "Kimi Code", keyUrl: "https://platform.moonshot.ai", modelHint: "k2.7-code", models: ["k2.7-code"] },
};

export default function SettingsPage() {
  const [me, setMe] = useState<PublicUser | null>(null);
  const [provider, setProvider] = useState("anthropic");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [freeAi, setFreeAi] = useState(false);
  const [freeBusy, setFreeBusy] = useState(false);
  const [language, setLanguage] = useState("en");
  const [langBusy, setLangBusy] = useState(false);

  const load = () =>
    api<{ user: PublicUser }>("/api/auth/me").then((d) => {
      setMe(d.user);
      setFreeAi(!!d.user?.freeAiAccess);
      setLanguage(d.user?.language || "en");
      if (d.user.provider) setProvider(d.user.provider);
      if (d.user.model) setModel(d.user.model);
    });

  const saveLanguage = async (code: string) => {
    const prev = language;
    setLanguage(code); // optimistic
    setLangBusy(true);
    try {
      await api("/api/settings/language", { method: "POST", body: JSON.stringify({ language: code }) });
    } catch {
      setLanguage(prev);
    } finally {
      setLangBusy(false);
    }
  };

  const toggleFreeAi = async (next: boolean) => {
    setFreeBusy(true);
    setFreeAi(next); // optimistic
    try {
      const r = await api<{ enabled: boolean }>("/api/settings/free-ai", {
        method: "POST",
        body: JSON.stringify({ enabled: next }),
      });
      setFreeAi(r.enabled);
    } catch {
      setFreeAi(!next); // revert on failure
    } finally {
      setFreeBusy(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/settings/ai", { method: "POST", body: JSON.stringify({ provider, key, model }) });
      setKey("");
      setMsg({ ok: true, text: "Connected — your AI is ready." });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await api("/api/settings/ai", { method: "DELETE" }).catch(() => {});
    setMsg(null);
    await load();
  };

  const meta = PROVIDERS[provider];

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-7">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            AI & SETTINGS
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(28px,4vw,40px)] font-extrabold uppercase leading-[0.98] text-ink">
          Your AI connection
        </h1>
      </header>

      <section className="glass rounded-[var(--radius-card-lg)] p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="language" className="text-[15px] font-semibold text-ink">
            Language
          </label>
          <p className="text-[13.5px] text-muted">
            Everything the AI writes for you — lessons, plans, coach replies, books — comes out in this
            language. If you write to the coach in another language, it&apos;ll offer to switch.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <select
            id="language"
            value={language}
            disabled={langBusy}
            onChange={(e) => saveLanguage(e.target.value)}
            className="w-full max-w-[280px] rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none focus:border-accent/50 disabled:opacity-60"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} — {l.native}
              </option>
            ))}
          </select>
          {langBusy && <span className="text-[12px] text-muted">Saving…</span>}
        </div>
      </section>

      {me?.isOwner ? (
        <>
          <section className="glass rounded-[var(--radius-card-lg)] p-6">
            <p className="text-[15px] font-semibold text-ink">You&apos;re the owner.</p>
            <p className="mt-1.5 text-[14px] text-muted">
              You use the app&apos;s built-in AI — nothing to set up. Everyone else brings their own key
              below, unless you open up free access.
            </p>
          </section>

          <section className="glass rounded-[var(--radius-card-lg)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">Free AI access for everyone</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                  Let signed-in users generate with your built-in AI — no key required. Everyone shares
                  one fair concurrency queue, so it keeps working continuously instead of getting
                  overrun by too many requests at once. Users can still add their own key to skip the
                  line.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={freeAi}
                disabled={freeBusy}
                onClick={() => toggleFreeAi(!freeAi)}
                className={`relative mt-1 h-[30px] w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                  freeAi ? "bg-up" : "bg-line"
                }`}
              >
                <span
                  className={`absolute top-[3px] size-[24px] rounded-full bg-white shadow transition-all ${
                    freeAi ? "left-[25px]" : "left-[3px]"
                  }`}
                />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <QueueBadge />
              <span className="text-[12.5px] font-medium text-muted">
                {freeAi ? "Free access is ON — everyone can use the built-in AI." : "Free access is off — only you use the built-in AI."}
              </span>
            </div>
          </section>

          <InstructorPanel />
        </>
      ) : (
        <>
          <section className="glass rounded-[var(--radius-card-lg)] p-6">
            {me?.freeAiAccess && (
              <div className="mb-4 rounded-[14px] border border-up/30 bg-up/10 p-4">
                <p className="text-[13.5px] font-semibold text-ink">Free shared AI is available 🎉</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  You can generate right now with the built-in AI — no key needed. It&apos;s a shared
                  queue, so during busy times your request waits its turn. Add your own key below to skip
                  the line.
                </p>
                <div className="mt-3">
                  <QueueBadge />
                </div>
              </div>
            )}
            <p className="text-[14px] text-muted">
              {me?.freeAiAccess
                ? "Prefer your own AI? Pick a provider and paste your key — DeepSeek and OpenRouter are the cheapest to start with."
                : "Abrany is free — you just connect your own AI. Pick a provider, paste your API key, and you're set. DeepSeek and OpenRouter are the cheapest to start with."}
            </p>
            {me && (
              <p className="mt-3 text-[13px]">
                Status:{" "}
                {me.hasKey ? (
                  <span className="font-semibold text-up">
                    Connected to {PROVIDERS[me.provider]?.label ?? me.provider}
                    {me.model ? ` (${me.model})` : ""}
                  </span>
                ) : me.freeAiAccess ? (
                  <span className="font-semibold text-up">Using free shared AI</span>
                ) : (
                  <span className="font-semibold text-accent">No key yet — add one below</span>
                )}
              </p>
            )}
          </section>

          <form onSubmit={save} className="glass flex flex-col gap-4 rounded-[var(--radius-card-lg)] p-6">
            <div>
              <label className="text-[12px] font-semibold uppercase tracking-wider text-muted">Provider</label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(PROVIDERS).map(([id, m]) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => {
                      setProvider(id);
                      setModel("");
                    }}
                    className={`rounded-[12px] px-3 py-2.5 text-[13px] font-semibold transition-all ${
                      provider === id ? "glassx-dark text-white" : "glassx text-ink"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[12px] font-semibold uppercase tracking-wider text-muted">API key</label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Paste your key"
                autoComplete="off"
                className="mt-2 w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
              />
              <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[12px] font-medium text-accent">
                Get a {meta.label} key →
              </a>
            </div>

            <div>
              <label className="text-[12px] font-semibold uppercase tracking-wider text-muted">
                Model {provider === "openrouter" ? "(searchable · live pricing)" : "(optional)"}
              </label>
              {provider === "openrouter" ? (
                <div className="mt-2">
                  <OpenRouterModelPicker value={model} onChange={setModel} />
                </div>
              ) : (
                <>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={meta.modelHint}
                    list={meta.models ? `models-${provider}` : undefined}
                    className="mt-2 w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
                  />
                  {meta.models && (
                    <datalist id={`models-${provider}`}>
                      {meta.models.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  )}
                </>
              )}
            </div>

            {msg && (
              <p className={`text-[13px] ${msg.ok ? "text-up" : "text-accent"}`}>{msg.text}</p>
            )}

            <div className="flex items-center justify-between gap-3">
              {me?.hasKey ? (
                <button type="button" onClick={disconnect} className="text-[12.5px] font-semibold text-muted hover:text-accent">
                  Disconnect
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={busy || !key}
                className="glassx-dark rounded-full px-6 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Checking key…" : "Connect"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
