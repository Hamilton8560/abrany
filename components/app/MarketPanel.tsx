"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { StoreIcon, PlusIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { msg, plural } from "@/lib/i18n";

type Listing = {
  id: number;
  goal_id: number;
  title: string;
  blurb: string;
  tags: string;
  age_group: string;
  clones: number;
  author: string;
  plan_version: number;
  milestones: number;
  sections: number;
  ready_sections: number;
  total_hours: number;
  created_at: string;
};

type MarketState = {
  listings: Listing[];
  mine: Listing[];
  publishable: { id: number; title: string }[];
};

const AGES: { id: string; label: string }[] = [
  { id: "", label: msg("Everyone") },
  { id: "kids", label: msg("Kids") },
  { id: "teens", label: msg("Teens") },
  { id: "adults", label: msg("Adults") },
  { id: "seniors", label: "50+" },
];

const ageLabel = (a: string) =>
  ({ kids: msg("Kids"), teens: msg("Teens"), adults: msg("Adults"), seniors: "50+", all: msg("All ages") } as Record<string, string>)[a] ?? a;

export default function MarketPanel() {
  const t = useT();
  const [data, setData] = useState<MarketState | null>(null);
  const [age, setAge] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (age) params.set("age", age);
      if (q.trim()) params.set("q", q.trim());
      setData(await api<MarketState>(`/api/market?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not load the marketplace"));
    }
  }, [age, q, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clone = async (l: Listing) => {
    setNotice(null);
    try {
      await api(`/api/market/${l.id}/clone`, { method: "POST" });
      setNotice(t("Added “{title}” to your goals — find it under Goals & Plans.", { title: l.title }));
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("Could not add that course"));
    }
  };

  if (error) return <p className="text-[13px] text-accent">{error}</p>;
  if (!data) return <p className="text-[13px] text-muted">{t("Loading…")}</p>;

  return (
    <div className="flex flex-col gap-6">
      {/* my listings + publish */}
      <section className="glass rounded-[var(--radius-card-lg)] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[16px] font-extrabold uppercase text-ink">{t("Your published courses")}</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              {data.mine.length ? t("{n} live", { n: data.mine.length }) : t("Nothing published yet — share what you've built.")}
            </p>
          </div>
          {data.publishable.length > 0 && (
            <button
              onClick={() => setShowPublish((v) => !v)}
              className="glassx flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink"
            >
              <PlusIcon className="size-4" /> {t("Publish a course")}
            </button>
          )}
        </div>

        {showPublish && <PublishForm publishable={data.publishable} onDone={() => { setShowPublish(false); refresh(); }} />}

        {data.mine.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {data.mine.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-white/60 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{l.title}</p>
                  <p className="text-[11px] text-muted">
                    {t(ageLabel(l.age_group))} · {t("{n} sections", { n: l.sections })} · {plural(t, l.clones, "{n} learner added it", "{n} learners added it")}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await api(`/api/market/${l.id}`, { method: "DELETE" }).catch(() => {});
                    refresh();
                  }}
                  className="text-[11.5px] font-semibold text-muted hover:text-accent"
                >
                  {t("Unpublish")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* browse */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {AGES.map((a) => (
            <button
              key={a.id}
              onClick={() => setAge(a.id)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                age === a.id ? "glassx-dark text-white" : "glassx text-ink"
              }`}
            >
              {t(a.label)}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search courses…")}
            className="ml-auto w-full max-w-[220px] rounded-full border border-line bg-white/70 px-4 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
          />
        </div>

        {notice && <p className="text-[12.5px] font-medium text-up">{notice}</p>}

        {data.listings.length === 0 ? (
          <div className="glass flex flex-col items-center gap-3 rounded-[var(--radius-card-lg)] px-6 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent/12 text-accent">
              <StoreIcon className="size-6" />
            </span>
            <p className="max-w-[380px] text-[13.5px] text-muted">
              {t("No courses here yet. Publish one of yours and it shows up for everyone.")}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.listings.map((l) => (
              <li key={l.id} className="glass flex flex-col gap-2.5 rounded-[var(--radius-card-lg)] p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14.5px] font-bold leading-snug text-ink">{l.title}</p>
                  {l.plan_version >= 2 && (
                    <span className="shrink-0 rounded-full bg-up/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-up">
                      {t("V2 plan")}
                    </span>
                  )}
                </div>
                {l.blurb && <p className="text-[12.5px] leading-relaxed text-muted">{l.blurb}</p>}
                <p className="text-[11px] text-muted">
                  {t("by")} <span className="font-semibold text-ink">{l.author}</span> · {t(ageLabel(l.age_group))}
                  {l.total_hours > 0 && <> · ~{l.total_hours}h</>}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {l.tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .slice(0, 4)
                    .map((tag) => (
                      <span key={tag} className="rounded-full bg-ink/8 px-2 py-0.5 text-[10.5px] font-medium text-muted">
                        {tag}
                      </span>
                    ))}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-line/60 pt-2.5">
                  <span className="text-[11px] text-muted">
                    {t("{milestones} milestones · {sections} sections ({ready} ready) · {clones} added", { milestones: l.milestones, sections: l.sections, ready: l.ready_sections, clones: l.clones })}
                  </span>
                  <button
                    onClick={() => clone(l)}
                    className="glassx-dark shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold text-white"
                  >
                    {t("Add to my goals")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PublishForm({
  publishable,
  onDone,
}: {
  publishable: { id: number; title: string }[];
  onDone: () => void;
}) {
  const t = useT();
  const [goalId, setGoalId] = useState("");
  const [blurb, setBlurb] = useState("");
  const [tags, setTags] = useState("");
  const [ageGroup, setAgeGroup] = useState("adults");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const publish = async () => {
    if (!goalId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/market", {
        method: "POST",
        body: JSON.stringify({ goalId: Number(goalId), blurb, tags, ageGroup }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Could not publish"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-[16px] border border-line bg-white/50 p-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <select
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        >
          <option value="">{t("Choose a course…")}</option>
          {publishable.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <select
          value={ageGroup}
          onChange={(e) => setAgeGroup(e.target.value)}
          className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        >
          <option value="kids">{t("Best for kids")}</option>
          <option value="teens">{t("Best for teens")}</option>
          <option value="adults">{t("Best for adults")}</option>
          <option value="seniors">{t("Best for 50+")}</option>
          <option value="all">{t("All ages")}</option>
        </select>
      </div>
      <textarea
        value={blurb}
        onChange={(e) => setBlurb(e.target.value)}
        placeholder={t("One or two sentences: who this course is for and what they'll be able to do.")}
        rows={2}
        className="rounded-[16px] border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
      />
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder={t("Tags, comma-separated — e.g. spanish, beginner, conversation")}
        className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
      />
      {err && <p className="text-[12px] text-accent">{err}</p>}
      <div className="flex justify-end">
        <button
          onClick={publish}
          disabled={busy || !goalId}
          className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? t("Publishing…") : t("Publish")}
        </button>
      </div>
    </div>
  );
}
