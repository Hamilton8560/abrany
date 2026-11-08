"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import QueueBadge from "@/components/app/QueueBadge";
import InstructorPanel from "@/components/app/InstructorPanel";
import OpenRouterModelPicker from "@/components/app/OpenRouterModelPicker";
import { LANGUAGES } from "@/lib/languages";
import { useT } from "@/lib/i18n/client";
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
  kimi: { label: "Kimi", keyUrl: "https://platform.moonshot.ai", modelHint: "k3", models: ["k3", "kimi-for-coding", "kimi-for-coding-highspeed"] },
};

export default function SettingsPage() {
  const t = useT();
  const router = useRouter();
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
  const [name, setName] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [notifyCerts, setNotifyCerts] = useState(true);
  const [notifyWeekly, setNotifyWeekly] = useState(true);
  const [notifyBusy, setNotifyBusy] = useState<"certificates" | "weeklyReport" | null>(null);

  const load = () =>
    api<{ user: PublicUser }>("/api/auth/me").then((d) => {
      setMe(d.user);
      setFreeAi(!!d.user?.freeAiAccess);
      setLanguage(d.user?.language || "en");
      setName(d.user?.name || "");
      setNotifyCerts(d.user?.notifyCertificates ?? true);
      setNotifyWeekly(d.user?.notifyWeeklyReport ?? true);
      if (d.user.provider) setProvider(d.user.provider);
      if (d.user.model) setModel(d.user.model);
    });

  const saveName = async () => {
    try {
      await api("/api/settings/profile", { method: "POST", body: JSON.stringify({ name }) });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 1600);
      load().catch(() => {});
    } catch {
      /* ignore */
    }
  };

  const saveLanguage = async (code: string) => {
    const prev = language;
    setLanguage(code); // optimistic
    setLangBusy(true);
    try {
      await api("/api/settings/language", { method: "POST", body: JSON.stringify({ language: code }) });
      // the account language drives the interface too — re-render the server tree in it now
      router.refresh();
    } catch {
      setLanguage(prev);
    } finally {
      setLangBusy(false);
    }
  };

  const toggleNotification = async (key: "certificates" | "weeklyReport", next: boolean) => {
    const revert = key === "certificates" ? setNotifyCerts : setNotifyWeekly;
    setNotifyBusy(key);
    revert(next); // optimistic
    try {
      await api("/api/settings/notifications", { method: "POST", body: JSON.stringify({ [key]: next }) });
    } catch {
      revert(!next);
    } finally {
      setNotifyBusy(null);
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
      setMsg({ ok: true, text: t("Connected — your AI is ready.") });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : t("Could not save") });
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
            {t("AI & Settings").toUpperCase()}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(28px,4vw,40px)] font-extrabold uppercase leading-[0.98] text-ink">
          {t("Your AI connection")}
        </h1>
      </header>

      <section className="glass rounded-[var(--radius-card-lg)] p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-[15px] font-semibold text-ink">
            {t("Your name")}
          </label>
          <p className="text-[13.5px] text-muted">
            {t("Shown on your certificates.")}{" "}
            {me ? <span className="text-ink">{t("Currently: {name}", { name: me.displayName })}</span> : null}
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            placeholder={t("e.g. David Hamilton")}
            className="w-full max-w-[320px] rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
          />
          {nameSaved && <span className="text-[12px] font-medium text-up">{t("Saved ✓")}</span>}
        </div>
      </section>

      <section className="glass rounded-[var(--radius-card-lg)] p-6">
        <p className="text-[15px] font-semibold text-ink">{t("Email notifications")}</p>
        <p className="mt-1.5 text-[13.5px] text-muted">
          {t("Sent from Abrany via summit-labs.io. Team sign-up emails (your temporary password) always send — everything below is optional.")}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {(
            [
              { key: "certificates" as const, checked: notifyCerts, label: t("Certificate earned"), desc: t("When you pass a final exam and a certificate is issued.") },
              { key: "weeklyReport" as const, checked: notifyWeekly, label: t("Weekly progress report"), desc: t("A Monday-ish digest of focus time, sections completed, and certificates.") },
            ]
          ).map((n) => (
            <div key={n.key} className="flex items-center justify-between gap-4 rounded-[14px] bg-white/50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">{n.label}</p>
                <p className="text-[12px] text-muted">{n.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={n.checked}
                disabled={notifyBusy === n.key}
                onClick={() => toggleNotification(n.key, !n.checked)}
                className={`relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                  n.checked ? "bg-up" : "bg-line"
                }`}
              >
                <span
                  className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow transition-all ${
                    n.checked ? "left-[23px]" : "left-[3px]"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="glass rounded-[var(--radius-card-lg)] p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="language" className="text-[15px] font-semibold text-ink">
            {t("Language")}
          </label>
          <p className="text-[13.5px] text-muted">
            {t("The app, your lessons and your emails use this language — menus and buttons, plus everything the AI writes for you: lessons, plans, coach replies and books. If you write to the coach in another language, it'll offer to switch.")}
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
                {l.native === l.name ? l.native : `${l.native} — ${l.name}`}
              </option>
            ))}
          </select>
          {langBusy && <span className="text-[12px] text-muted">{t("Saving…")}</span>}
        </div>
      </section>

      {me?.isOwner ? (
        <>
          <section className="glass rounded-[var(--radius-card-lg)] p-6">
            <p className="text-[15px] font-semibold text-ink">{t("You're the owner.")}</p>
            <p className="mt-1.5 text-[14px] text-muted">
              {t("You use the app's built-in AI — nothing to set up. Everyone else brings their own key below, unless you open up free access.")}
            </p>
          </section>

          <section className="glass rounded-[var(--radius-card-lg)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">{t("Free AI access for everyone")}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                  {t("Let signed-in users generate with your built-in AI — no key required. Everyone shares one fair concurrency queue, so it keeps working continuously instead of getting overrun by too many requests at once. Users can still add their own key to skip the line.")}
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
                {freeAi ? t("Free access is ON — everyone can use the built-in AI.") : t("Free access is off — only you use the built-in AI.")}
              </span>
            </div>
          </section>

          <InstructorPanel />
        </>
      ) : (
        <>
          <section className="glass rounded-[var(--radius-card-lg)] p-6">
            {me?.orgAi && !me.hasKey && (
              <div className="mb-4 rounded-[14px] border border-up/30 bg-up/10 p-4">
                <p className="text-[13.5px] font-semibold text-ink">{t("Your company's AI is connected ✓")}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {t("You were signed up by your employer, so everything you generate — courses, the tutor, exams — runs on their AI. No key needed. You can still add a personal key below to use your own.")}
                </p>
              </div>
            )}
            {me?.freeAiAccess && !me.orgAi && (
              <div className="mb-4 rounded-[14px] border border-up/30 bg-up/10 p-4">
                <p className="text-[13.5px] font-semibold text-ink">{t("Free shared AI is available 🎉")}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {t("You can generate right now with the built-in AI — no key needed. It's a shared queue, so during busy times your request waits its turn. Add your own key below to skip the line.")}
                </p>
                <div className="mt-3">
                  <QueueBadge />
                </div>
              </div>
            )}
            <p className="text-[14px] text-muted">
              {me?.freeAiAccess || me?.orgAi
                ? t("Prefer your own AI? Pick a provider and paste your key — DeepSeek and OpenRouter are the cheapest to start with.")
                : t("Abrany is free — you just connect your own AI. Pick a provider, paste your API key, and you're set. DeepSeek and OpenRouter are the cheapest to start with.")}
            </p>
            {me && (
              <p className="mt-3 text-[13px]">
                {t("Status:")}{" "}
                {me.hasKey ? (
                  <span className="font-semibold text-up">
                    {t("Connected to {provider}", { provider: PROVIDERS[me.provider]?.label ?? me.provider })}
                    {me.model ? ` (${me.model})` : ""}
                  </span>
                ) : me.orgAi ? (
                  <span className="font-semibold text-up">{t("Using your company's AI")}</span>
                ) : me.freeAiAccess ? (
                  <span className="font-semibold text-up">{t("Using free shared AI")}</span>
                ) : (
                  <span className="font-semibold text-accent">{t("No key yet — add one below")}</span>
                )}
              </p>
            )}
          </section>

          <form onSubmit={save} className="glass flex flex-col gap-4 rounded-[var(--radius-card-lg)] p-6">
            <div>
              <label className="text-[12px] font-semibold uppercase tracking-wider text-muted">{t("Provider")}</label>
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
              <label className="text-[12px] font-semibold uppercase tracking-wider text-muted">{t("API key")}</label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t("Paste your key")}
                autoComplete="off"
                className="mt-2 w-full rounded-[14px] border border-line bg-white/70 px-4 py-3 text-[14px] text-ink outline-none placeholder:text-muted/60 focus:border-accent/50"
              />
              <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[12px] font-medium text-accent">
                {t("Get a {provider} key →", { provider: meta.label })}
              </a>
            </div>

            <div>
              <label className="text-[12px] font-semibold uppercase tracking-wider text-muted">
                {t("Model")} {provider === "openrouter" ? t("(searchable · live pricing)") : t("(optional)")}
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
                  {t("Disconnect")}
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={busy || !key}
                className="glassx-dark rounded-full px-6 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? t("Checking key…") : t("Connect")}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
