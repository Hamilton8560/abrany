"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, fmtDuration } from "@/lib/client";
import { BuildingIcon, CheckIcon, PlusIcon } from "@/components/icons";
import DraftAssistant from "@/components/app/DraftAssistant";
import { useI18n, useT } from "@/lib/i18n/client";
import { plural } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/languages";

/* ── types mirrored from the org API ───────────────────────── */

type OrgView = { id: number; name: string; logo: string; tagline: string; createdAt: string; apiKey?: string };
type Member = { user_id: number; role: "admin" | "member"; email: string; display_name: string; created_at: string; language: string };
type Invite = { id: number; email: string; role: string; created_at: string };
type Progress = {
  id: number;
  goal_id: number;
  goal_title: string;
  employee_email: string;
  employee_name: string;
  note: string;
  due_at: string | null;
  status: "assigned" | "in_progress" | "passed" | "failed";
  passed_late: number;
  sections_total: number;
  sections_done: number;
  read_sec: number;
  focus_sec: number;
  exam_best: number;
  exam_passed: number;
  build_status?: string;
  build_error?: string;
  org_name?: string;
  org_logo?: string;
};
type ApiProgress = {
  id: number;
  employee: { userId: number; email: string; name: string };
  title: string;
  note: string;
  dueAt: string | null;
  status: Progress["status"];
  passedLate: boolean;
  progress: {
    sectionsDone: number;
    sectionsTotal: number;
    readingSec: number;
    focusSec: number;
    finalExamBest: number;
    finalExamPassed: boolean;
  };
};
type Detail = ApiProgress & {
  sections: { title: string; kind: string; status: string; completedAt: string | null; grade: string; readingSec: number }[];
  exams: { kind: string; bestScore: number; passed: boolean; attempts: number }[];
};
type OrgState = {
  org: OrgView | null;
  role: "admin" | "member" | null;
  myAssignments: Progress[];
  admin?: { members: Member[]; invites: Invite[]; assignments: Progress[] };
};

const DATE_OPTS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

/** Languages an admin can pick for an employee (the UI ships in these). */
const MEMBER_LANGS = LANGUAGES.filter((l) => l.code === "en" || l.code === "es");
const langOptions = (current?: string) => {
  if (!current || MEMBER_LANGS.some((l) => l.code === current)) return MEMBER_LANGS;
  const extra = LANGUAGES.find((l) => l.code === current) ?? { code: current, name: current, native: current, iso3: "" };
  return [...MEMBER_LANGS, extra];
};

/** Splice JSX into a translated sentence at its {placeholders} so word order stays natural. */
function rich(s: string, parts: Record<string, ReactNode>): ReactNode[] {
  return s.split(/\{(\w+)\}/).map((piece, i) => (i % 2 ? <span key={i}>{parts[piece] ?? `{${piece}}`}</span> : piece));
}

const daysLeft = (dueIso: string) =>
  Math.ceil((new Date(dueIso).getTime() - Date.now()) / 86_400_000);

function StatusChip({ status, late, build }: { status: Progress["status"]; late?: boolean; build?: string }) {
  const t = useT();
  const map = {
    passed: ["bg-up/15 text-up", late ? t("Passed (late)") : t("Passed")],
    failed: ["bg-accent/15 text-accent", t("Failed — past due")],
    in_progress: ["bg-ink/10 text-ink", t("In progress")],
    assigned: ["glassx text-muted", t("Assigned")],
  } as const;
  let [cls, label] = map[status] as readonly [string, string];
  if (status === "assigned" && (build === "queued" || build === "building")) [cls, label] = ["bg-accent/12 text-accent", t("Building course…")];
  if (status === "assigned" && build === "error") [cls, label] = ["bg-accent/15 text-accent", t("Build failed")];
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-up transition-all" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[11px] text-muted">
        {done}/{total}
      </span>
    </span>
  );
}

/* ── main panel ────────────────────────────────────────────── */

export default function OrgPanel() {
  const t = useT();
  const [data, setData] = useState<OrgState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api<OrgState>("/api/orgs"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not load your organization"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // while any assigned course is still being written, keep the dashboard live
  const anyBuilding = !!(
    data?.admin?.assignments.some((a) => a.build_status === "queued" || a.build_status === "building") ||
    data?.myAssignments.some((a) => a.build_status === "queued" || a.build_status === "building")
  );
  useEffect(() => {
    if (!anyBuilding) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [anyBuilding, refresh]);

  if (error) return <p className="text-[13px] text-accent">{error}</p>;
  if (!data) return <p className="text-[13px] text-muted">{t("Loading…")}</p>;

  return (
    <div className="flex flex-col gap-6">
      {data.myAssignments.length > 0 && <MyTraining items={data.myAssignments} />}
      {!data.org ? (
        <CreateOrg onCreated={refresh} />
      ) : data.role === "admin" ? (
        <AdminPanel data={data} refresh={refresh} />
      ) : (
        <MemberCard org={data.org} />
      )}
    </div>
  );
}

/* ── employee: assigned training ───────────────────────────── */

function MyTraining({ items }: { items: Progress[] }) {
  const t = useT();
  const { date } = useI18n();
  return (
    <section className="glass rounded-[var(--radius-card-lg)] p-5 sm:p-6">
      <h2 className="font-display text-[16px] font-extrabold uppercase text-ink">{t("Assigned to you")}</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        {t("Education your company assigned. It lives with your own goals — study it the same way.")}
      </p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {items.map((a) => {
          const dl = a.due_at ? daysLeft(a.due_at) : null;
          return (
            <li key={a.id} className="rounded-[14px] bg-white/60 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/app/goals/${a.goal_id}`} className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink hover:text-accent">{a.goal_title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    {a.org_name && <span className="font-semibold text-ink">{a.org_name}</span>}
                    {a.due_at && (
                      <span className={dl !== null && dl < 3 && a.status !== "passed" ? "font-semibold text-accent" : ""}>
                        {t("Due {date}", { date: date(a.due_at, DATE_OPTS) })}
                        {dl !== null && a.status !== "passed" && (dl >= 0 ? " · " + t("{n}d left", { n: dl }) : " · " + t("overdue"))}
                      </span>
                    )}
                    {a.note && <span>“{a.note}”</span>}
                  </p>
                </Link>
                <div className="flex items-center gap-3">
                  <ProgressBar done={a.sections_done} total={a.sections_total} />
                  <StatusChip status={a.status} late={!!a.passed_late} build={a.build_status} />
                  <Link
                    href={`/app/goals/${a.goal_id}`}
                    className="glassx-dark shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold text-white"
                  >
                    {a.status === "passed" ? t("Open") : a.sections_done > 0 ? t("Continue") : t("Start")}
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MemberCard({ org }: { org: OrgView }) {
  const t = useT();
  return (
    <section className="glass flex items-center gap-4 rounded-[var(--radius-card-lg)] p-5 sm:p-6">
      {org.logo ? (
        <img src={org.logo} alt={org.name} className="size-12 rounded-[12px] object-contain" />
      ) : (
        <span className="grid size-12 place-items-center rounded-[12px] bg-ink/10 text-ink">
          <BuildingIcon className="size-6" />
        </span>
      )}
      <div>
        <p className="font-display text-[16px] font-extrabold uppercase text-ink">{org.name}</p>
        <p className="text-[12.5px] text-muted">
          {org.tagline || t("You're a member. Training your company assigns appears above and with your goals.")}
        </p>
      </div>
    </section>
  );
}

/* ── no org yet ────────────────────────────────────────────── */

function CreateOrg({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/orgs", { method: "POST", body: JSON.stringify({ name }) });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Could not create the organization"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass flex flex-col items-center gap-4 rounded-[var(--radius-card-lg)] px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-accent/12 text-accent">
        <BuildingIcon className="size-7" />
      </span>
      <div>
        <h2 className="font-display text-[18px] font-extrabold uppercase text-ink">{t("Set up your company")}</h2>
        <p className="mx-auto mt-1 max-w-[420px] text-[13px] text-muted">
          {t("Sign employees up, assign curricula with deadlines, track reading time per section with a clear pass/fail, connect any AI over API/MCP, and put your logo on the certificates.")}
        </p>
      </div>
      <div className="flex w-full max-w-[380px] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder={t("Company name — e.g. American Iron")}
          className="min-w-0 flex-1 rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="glassx-dark shrink-0 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? t("Creating…") : t("Create")}
        </button>
      </div>
      {err && <p className="text-[12.5px] text-accent">{err}</p>}
      <p className="text-[11.5px] text-muted">
        {t("Just here to learn? Nothing changes — your personal goals stay yours. If your employer invited you, you joined automatically at signup.")}
      </p>
    </section>
  );
}

/* ── admin panel ───────────────────────────────────────────── */

type Tab = "assignments" | "programs" | "team" | "branding" | "api";

function AdminPanel({ data, refresh }: { data: OrgState; refresh: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("assignments");
  const org = data.org!;
  const admin = data.admin!;

  const tabs: { id: Tab; label: string }[] = [
    { id: "assignments", label: t("Assignments") },
    { id: "programs", label: t("Programs") },
    { id: "team", label: t("Team ({n})", { n: admin.members.length }) },
    { id: "branding", label: t("Branding") },
    { id: "api", label: t("API & MCP") },
  ];

  return (
    <section className="glass rounded-[var(--radius-card-lg)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {org.logo ? (
            <img src={org.logo} alt={org.name} className="size-11 rounded-[11px] object-contain" />
          ) : (
            <span className="grid size-11 place-items-center rounded-[11px] bg-ink/10 text-ink">
              <BuildingIcon className="size-5" />
            </span>
          )}
          <div>
            <p className="font-display text-[16px] font-extrabold uppercase text-ink">{org.name}</p>
            <p className="text-[11.5px] text-muted">{org.tagline || t("Admin · manage training below")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                tab === tb.id ? "glassx-dark text-white" : "glassx text-ink"
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {tab === "assignments" && <AssignmentsTab members={admin.members} assignments={admin.assignments} refresh={refresh} />}
        {tab === "programs" && <ProgramsTab members={admin.members} refresh={refresh} />}
        {tab === "team" && <TeamTab members={admin.members} invites={admin.invites} refresh={refresh} />}
        {tab === "branding" && <BrandingTab org={org} refresh={refresh} />}
        {tab === "api" && <ApiTab org={org} refresh={refresh} />}
      </div>
    </section>
  );
}

/* ── programs tab ──────────────────────────────────────────── */

type ProgramRow = {
  id: number;
  title: string;
  description: string;
  source_lang: string;
  milestone_count: number;
  lesson_count: number;
  created_at: string;
};

function ProgramsTab({ members, refresh }: { members: Member[]; refresh: () => void }) {
  const t = useT();
  const [programs, setPrograms] = useState<ProgramRow[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // per-program deploy state
  const [deployFor, setDeployFor] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ programs: ProgramRow[] }>("/api/orgs/programs");
      setPrograms(d.programs);
    } catch {
      setPrograms([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await api<{ programs: ProgramRow[] }>("/api/orgs/programs", {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });
      setPrograms(d.programs);
      setTitle("");
      setDescription("");
      setShowNew(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Could not build the program"));
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: number, title: string) => {
    if (!window.confirm(t("Delete the program “{title}”? Employees already assigned keep their courses.", { title }))) return;
    try {
      const d = await api<{ programs: ProgramRow[] }>(`/api/orgs/programs/${id}`, { method: "DELETE" });
      setPrograms(d.programs);
    } catch {
      /* best effort */
    }
  };

  const openDeploy = (id: number) => {
    setDeployFor(deployFor === id ? null : id);
    setPicked(new Set());
    setDueAt("");
    setNote("");
    setDeployMsg(null);
  };

  const deploy = async (id: number) => {
    if (!picked.size || deploying) return;
    setDeploying(true);
    setDeployMsg(null);
    try {
      const r = await api<{ deployed: number; skipped: number }>(`/api/orgs/programs/${id}/deploy`, {
        method: "POST",
        body: JSON.stringify({ userIds: [...picked], dueAt: dueAt || null, note }),
      });
      setDeployMsg(
        plural(t, r.deployed, "Deployed to {n} employee", "Deployed to {n} employees") +
          (r.skipped ? t(", {n} already had it", { n: r.skipped }) : "") +
          ". " +
          t("Section content is being written in the background — track it on the Assignments tab."),
      );
      setPicked(new Set());
      refresh();
    } catch (e) {
      setDeployMsg(e instanceof Error ? e.message : t("Deploy failed"));
    } finally {
      setDeploying(false);
    }
  };

  const togglePick = (uid: number) => {
    const next = new Set(picked);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setPicked(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-muted">
          {t("Author a course once, then deploy it to a whole team — each employee gets their own copy in their language.")}
        </p>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="glassx flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink"
        >
          <PlusIcon className="size-4" /> {t("New program")}
        </button>
      </div>

      {showNew && (
        <div className="flex flex-col gap-2.5 rounded-[16px] border border-line bg-white/50 p-4">
          <DraftAssistant
            surfaceId="program"
            seed={title}
            onApply={(v) => {
              if (v.title) setTitle(v.title);
              if (v.description) setDescription(v.description);
            }}
            triggerLabel={t("Not sure what to build? Draft with AI")}
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("Program title, e.g. New-hire safety onboarding")}
            className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Who it's for, the level it assumes, and the outcome the team should reach…")}
            rows={2}
            className="rounded-[16px] border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          {err && <p className="text-[12px] text-accent">{err}</p>}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted">{t("The AI drafts the full milestone + lesson structure; content is generated per employee on open.")}</p>
            <button
              onClick={create}
              disabled={busy || !title.trim()}
              className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? t("Building…") : t("Build program")}
            </button>
          </div>
        </div>
      )}

      {programs === null && <p className="py-6 text-center text-[13px] text-muted">{t("Loading…")}</p>}
      {programs && programs.length === 0 && !showNew && (
        <p className="py-6 text-center text-[13px] text-muted">{t("No programs yet — build one to reuse across your team.")}</p>
      )}

      <ul className="flex flex-col gap-2.5">
        {(programs ?? []).map((p) => (
          <li key={p.id} className="rounded-[14px] bg-white/60 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">{p.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {plural(t, p.milestone_count, "{n} milestone", "{n} milestones")} ·{" "}
                  {plural(t, p.lesson_count, "{n} lesson", "{n} lessons")} ·{" "}
                  {t("authored in {lang}", { lang: p.source_lang.toUpperCase() })}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openDeploy(p.id)}
                  className="glassx rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-ink"
                >
                  {t("Deploy")}
                </button>
                <button
                  onClick={() => del(p.id, p.title)}
                  className="rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:text-accent"
                >
                  {t("Delete")}
                </button>
              </div>
            </div>

            {deployFor === p.id && (
              <div className="mt-3 flex flex-col gap-2.5 rounded-[12px] border border-line bg-white/60 p-3">
                <p className="text-[12px] font-semibold text-ink">{t("Deploy to employees")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <button
                      key={m.user_id}
                      onClick={() => togglePick(m.user_id)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                        picked.has(m.user_id) ? "glassx-dark text-white" : "glassx text-ink"
                      }`}
                    >
                      {m.display_name}
                    </button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="date"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="rounded-full border border-line bg-white/70 px-4 py-2 text-[13px] text-ink outline-none focus:border-accent"
                  />
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("Optional note employees see")}
                    className="rounded-full border border-line bg-white/70 px-4 py-2 text-[13px] text-ink outline-none focus:border-accent"
                  />
                </div>
                {deployMsg && <p className="text-[12px] text-muted">{deployMsg}</p>}
                <div className="flex justify-end">
                  <button
                    onClick={() => deploy(p.id)}
                    disabled={deploying || !picked.size}
                    className="glassx-dark rounded-full px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                  >
                    {deploying ? t("Deploying…") : t("Deploy to {n}", { n: picked.size || "…" })}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── team tab ──────────────────────────────────────────────── */

function TeamTab({ members, invites, refresh }: { members: Member[]; invites: Invite[]; refresh: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [rows, setRows] = useState<Member[]>(members);
  useEffect(() => setRows(members), [members]);
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<string>(locale === "es" ? "es" : "en");
  const [langBusy, setLangBusy] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState<number | null>(null);

  /** Rescue path: a fresh single-use password link, delivered even if the welcome email never was. */
  const sendResetLink = async (m: Member) => {
    setLinkBusy(m.user_id);
    setMsg(null);
    try {
      await api(`/api/orgs/members/${m.user_id}/reset-link`, { method: "POST" });
      setMsg(t("Reset link sent to {email}. It works once and expires in 7 days.", { email: m.email }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("Could not send the link"));
    } finally {
      setLinkBusy(null);
    }
  };

  const remove = async (m: Member) => {
    if (!window.confirm(t("Remove {name} ({email}) from the team? Their account and courses stay; you just stop tracking them.", { name: m.display_name, email: m.email }))) return;
    await api(`/api/orgs/members/${m.user_id}`, { method: "DELETE" }).catch(() => {});
    refresh();
  };

  const add = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ status: string }>("/api/orgs/members", {
        method: "POST",
        body: JSON.stringify({ email, language }),
      });
      setMsg(
        r.status === "added"
          ? t("Added — they'll see assigned training on their Company page and dashboard. We emailed them a heads-up.")
          : r.status === "created"
            ? t("Signed up — we emailed them a temporary password. They'll set their own the moment they log in. If it doesn't arrive, use “Send reset link” on their row.")
            : t("Already a member."),
      );
      setEmail("");
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("Could not add that person"));
    } finally {
      setBusy(false);
    }
  };

  const setMemberLanguage = async (m: Member, lang: string) => {
    if (lang === m.language) return;
    setLangBusy(m.user_id);
    setMsg(null);
    try {
      const r = await api<{ members: Member[] }>("/api/orgs/members/" + m.user_id, {
        method: "PATCH",
        body: JSON.stringify({ language: lang }),
      });
      if (r?.members) setRows(r.members);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("Could not change the language"));
    } finally {
      setLangBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="employee@company.com"
          className="min-w-0 flex-1 rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        <button
          onClick={add}
          disabled={busy || !email.trim()}
          className="glassx-dark flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <PlusIcon className="size-4" /> {t("Sign up")}
        </button>
      </div>
      <label className="-mt-2 flex flex-wrap items-center gap-2 px-1 text-[11.5px] text-muted">
        <span className="font-semibold text-ink">{t("Language")}</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded-full border border-line bg-white/70 px-3 py-1 text-[12px] text-ink outline-none focus:border-accent"
        >
          {MEMBER_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native}
            </option>
          ))}
        </select>
        <span>{t("Their app, lessons and emails will be in this language.")}</span>
      </label>
      {msg && <p className="text-[12px] text-muted">{msg}</p>}

      <ul className="flex flex-col gap-2">
        {rows.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between gap-3 rounded-[14px] bg-white/60 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-ink">{m.display_name}</p>
              <p className="truncate text-[11.5px] text-muted">{m.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-ink/8 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-muted">
                {t(m.role)}
              </span>
              <select
                value={m.language || "en"}
                onChange={(e) => setMemberLanguage(m, e.target.value)}
                disabled={langBusy === m.user_id}
                aria-label={t("Language")}
                title={t("Their app, lessons and emails will be in this language.")}
                className="rounded-full border border-line bg-white/70 px-2 py-1 text-[11.5px] font-semibold text-ink outline-none focus:border-accent disabled:opacity-50"
              >
                {langOptions(m.language || "en").map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native}
                  </option>
                ))}
              </select>
              <button
                onClick={() => sendResetLink(m)}
                disabled={linkBusy === m.user_id}
                title={t("Email them a single-use link to set a password — for anyone locked out or who never got their welcome email")}
                className="text-[11.5px] font-semibold text-muted hover:text-ink disabled:opacity-50"
              >
                {linkBusy === m.user_id ? t("Sending…") : t("Send reset link")}
              </button>
              {m.role !== "admin" && (
                <button onClick={() => remove(m)} className="text-[11.5px] font-semibold text-muted hover:text-accent">
                  {t("Remove")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("Pending invites")}</p>
          <ul className="flex flex-col gap-2">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-line bg-white/40 px-4 py-2.5">
                <p className="truncate text-[13px] text-muted">{i.email}</p>
                <button
                  onClick={async () => {
                    await api(`/api/orgs/invites/${i.id}`, { method: "DELETE" }).catch(() => {});
                    refresh();
                  }}
                  className="text-[11.5px] font-semibold text-muted hover:text-accent"
                >
                  {t("Revoke")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── assignments tab ───────────────────────────────────────── */

function AssignmentsTab({
  members,
  assignments,
  refresh,
}: {
  members: Member[];
  assignments: Progress[];
  refresh: () => void;
}) {
  const t = useT();
  const { date } = useI18n();
  const [showForm, setShowForm] = useState(assignments.length === 0);
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDue, setEditDue] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const startEdit = (a: Progress) => {
    setEditingId(a.id);
    setEditDue(a.due_at ? a.due_at.slice(0, 10) : "");
    setEditNote(a.note);
  };
  const saveEdit = async (id: number) => {
    setEditBusy(true);
    try {
      await api(`/api/orgs/assignments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dueAt: editDue || null, note: editNote }),
      });
      setEditingId(null);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Could not update the assignment"));
    } finally {
      setEditBusy(false);
    }
  };
  const stopTracking = async (a: Progress) => {
    if (!window.confirm(t("Stop tracking “{title}” for {name}? They keep the course; it just disappears from this list.", { title: a.goal_title, name: a.employee_name || a.employee_email }))) return;
    await api(`/api/orgs/assignments/${a.id}`, { method: "DELETE" }).catch(() => {});
    refresh();
  };

  const create = async () => {
    if (!email || !title.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/orgs/assignments", {
        method: "POST",
        body: JSON.stringify({ email, title, description, note, dueAt: dueAt || null }),
      });
      setTitle("");
      setDescription("");
      setNote("");
      setDueAt("");
      setShowForm(false);
      setNotice(t("Assigned. The course is being built now — the employee opens a ready course with every section written. You'll see it fill in below."));
      setTimeout(() => setNotice(null), 9000);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Could not create the assignment"));
    } finally {
      setBusy(false);
    }
  };

  const toggleDetail = async (id: number) => {
    if (openDetail === id) {
      setOpenDetail(null);
      return;
    }
    setOpenDetail(id);
    setDetail(null);
    try {
      const d = await api<{ assignment: Detail }>(`/api/orgs/assignments/${id}`);
      setDetail(d.assignment);
    } catch {
      setDetail(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-muted">
          {t("The employee gets the course as a goal of their own; you see time, progress and pass/fail here.")}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="glassx flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink"
        >
          <PlusIcon className="size-4" /> {t("Assign education")}
        </button>
      </div>

      {showForm && (
        <div className="flex flex-col gap-2.5 rounded-[16px] border border-line bg-white/50 p-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <select
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
            >
              <option value="">{t("Choose an employee…")}</option>
              {members
                .filter((m) => m.role !== "admin")
                .concat(members.filter((m) => m.role === "admin"))
                .map((m) => (
                  <option key={m.user_id} value={m.email}>
                    {m.display_name} — {m.email}
                  </option>
                ))}
            </select>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
            />
          </div>
          <DraftAssistant
            surfaceId="assignment"
            seed={title}
            context={
              email
                ? `This training is for ${members.find((m) => m.email === email)?.display_name ?? email} (${email}).`
                : "The employee hasn't been chosen yet."
            }
            onApply={(v) => {
              if (v.title) setTitle(v.title);
              if (v.description) setDescription(v.description);
              if (v.note) setNote(v.note);
              if (v.dueAt) setDueAt(v.dueAt);
            }}
            triggerLabel={t("Not sure how to scope it? Draft with AI")}
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("What should they learn? e.g. OSHA 10 refresher, TIG welding fundamentals")}
            className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Optional context for the AI curriculum (level, focus areas, what 'good' looks like)…")}
            rows={2}
            className="rounded-[16px] border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("Optional note the employee sees, e.g. 'Required before the March site visit'")}
            className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          {err && <p className="text-[12px] text-accent">{err}</p>}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted">
              {t("The AI builds the whole course (plan, sections, exams) in the background from the title and context. Want to author it yourself? Use Programs, or the API & MCP tab.")}
            </p>
            <button
              onClick={create}
              disabled={busy || !email || !title.trim()}
              className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? t("Assigning…") : t("Assign")}
            </button>
          </div>
        </div>
      )}

      {notice && <p className="rounded-[12px] bg-up/10 px-4 py-2.5 text-[12.5px] text-ink">{notice}</p>}
      {err && !showForm && <p className="text-[12px] text-accent">{err}</p>}
      {assignments.length === 0 && !showForm && (
        <p className="py-6 text-center text-[13px] text-muted">{t("No assignments yet.")}</p>
      )}

      <ul className="flex flex-col gap-2.5">
        {assignments.map((a) => {
          const dl = a.due_at ? daysLeft(a.due_at) : null;
          return (
            <li key={a.id} className="rounded-[14px] bg-white/60 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <button onClick={() => toggleDetail(a.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{a.goal_title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    <span className="font-medium text-ink">{a.employee_name || a.employee_email}</span>
                    {a.due_at && (
                      <span className={dl !== null && dl < 3 && a.status !== "passed" ? "font-semibold text-accent" : ""}>
                        {t("Due {date}", { date: date(a.due_at, DATE_OPTS) })}
                        {dl !== null && a.status !== "passed" && (dl >= 0 ? " · " + t("{n}d left", { n: dl }) : "")}
                      </span>
                    )}
                    <span>{t("Read {time}", { time: fmtDuration(a.read_sec) })}</span>
                    <span>{t("Focus {time}", { time: fmtDuration(a.focus_sec) })}</span>
                    {a.exam_best > 0 && <span>{t("Final {score}%", { score: a.exam_best })}</span>}
                    {a.build_status === "error" && <span className="text-accent">{t("Build failed: {error}", { error: a.build_error || t("unknown error") })}</span>}
                  </p>
                </button>
                <div className="flex items-center gap-3">
                  <ProgressBar done={a.sections_done} total={a.sections_total} />
                  <StatusChip status={a.status} late={!!a.passed_late} build={a.build_status} />
                  <button
                    onClick={() => (editingId === a.id ? setEditingId(null) : startEdit(a))}
                    title={t("Change the deadline or note")}
                    className="text-[11.5px] font-semibold text-muted hover:text-ink"
                  >
                    {t("Edit")}
                  </button>
                  <button
                    onClick={() => stopTracking(a)}
                    title={t("Stop tracking (the employee keeps the course)")}
                    className="text-[11.5px] font-semibold text-muted hover:text-accent"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {editingId === a.id && (
                <div className="mt-3 grid gap-2 rounded-[12px] border border-line bg-white/60 p-3 sm:grid-cols-[1fr_2fr_auto]">
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    className="rounded-full border border-line bg-white/80 px-4 py-2 text-[13px] text-ink outline-none focus:border-accent"
                  />
                  <input
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder={t("Note the employee sees")}
                    className="rounded-full border border-line bg-white/80 px-4 py-2 text-[13px] text-ink outline-none focus:border-accent"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveEdit(a.id)}
                      disabled={editBusy}
                      className="glassx-dark rounded-full px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                    >
                      {editBusy ? t("Saving…") : t("Save")}
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-[12px] font-semibold text-muted hover:text-ink">
                      {t("Cancel")}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted sm:col-span-3">
                    {t("Pushing a deadline out un-fails a past-due assignment. Clear the date for no deadline.")}
                  </p>
                </div>
              )}

              {openDetail === a.id && (
                <div className="mt-3 border-t border-line/60 pt-3">
                  {!detail ? (
                    <p className="text-[12px] text-muted">{t("Loading detail…")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[12px]">
                        <thead>
                          <tr className="text-[10.5px] uppercase tracking-wide text-muted">
                            <th className="py-1.5 pr-3 font-semibold">{t("Section")}</th>
                            <th className="py-1.5 pr-3 font-semibold">{t("Kind")}</th>
                            <th className="py-1.5 pr-3 font-semibold">{t("Reading time")}</th>
                            <th className="py-1.5 pr-3 font-semibold">{t("Done")}</th>
                            <th className="py-1.5 font-semibold">{t("Grade")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.sections.map((s, i) => (
                            <tr key={i} className="border-t border-line/50">
                              <td className="max-w-[280px] truncate py-1.5 pr-3 text-ink">{s.title}</td>
                              <td className="py-1.5 pr-3 capitalize text-muted">{t(s.kind)}</td>
                              <td className="py-1.5 pr-3 text-muted">{s.readingSec ? fmtDuration(s.readingSec) : "—"}</td>
                              <td className="py-1.5 pr-3">
                                {s.completedAt ? <CheckIcon className="size-3.5 text-up" /> : <span className="text-muted">—</span>}
                              </td>
                              <td className="py-1.5 text-ink">{s.grade || "—"}</td>
                            </tr>
                          ))}
                          {detail.exams.map((e, i) => (
                            <tr key={`e${i}`} className="border-t border-line/50 font-semibold">
                              <td className="py-1.5 pr-3 capitalize text-ink">
                                {e.kind === "final" ? t("final exam") : e.kind === "midterm" ? t("midterm exam") : t("{kind} exam", { kind: e.kind })}
                              </td>
                              <td className="py-1.5 pr-3 text-muted">{t("exam")}</td>
                              <td className="py-1.5 pr-3 text-muted">{plural(t, e.attempts, "{n} attempt", "{n} attempts")}</td>
                              <td className="py-1.5 pr-3">
                                {e.passed ? <CheckIcon className="size-3.5 text-up" /> : <span className="text-muted">—</span>}
                              </td>
                              <td className="py-1.5 text-ink">{e.bestScore > 0 ? `${e.bestScore}%` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── branding tab ──────────────────────────────────────────── */

function BrandingTab({ org, refresh }: { org: OrgView; refresh: () => void }) {
  const t = useT();
  const [name, setName] = useState(org.name);
  const [tagline, setTagline] = useState(org.tagline);
  const [logo, setLogo] = useState(org.logo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 300_000) {
      setMsg(t("Logo too large — keep it under 300 KB (PNG/SVG with transparency looks best)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/orgs", { method: "PATCH", body: JSON.stringify({ name, tagline, logo }) });
      setMsg(t("Saved. New certificates from assigned training now carry your brand."));
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("Could not save branding"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-muted">
        {t("Certificates earned from training you assign are issued under your brand — your logo and name up top, “in partnership with Abrany” beneath. Employees and anyone verifying see both.")}
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("Company name")}
          className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder={t("Tagline (shown under your name), e.g. Training & Safety")}
          className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="glassx cursor-pointer rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-ink">
          {logo ? t("Replace logo") : t("Upload logo")}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
        </label>
        {logo && (
          <>
            <img src={logo} alt={t("logo preview")} className="h-12 max-w-[160px] object-contain" />
            <button onClick={() => setLogo("")} className="text-[11.5px] font-semibold text-muted hover:text-accent">
              {t("Remove")}
            </button>
          </>
        )}
      </div>

      {/* live white-label preview */}
      <div className="rounded-[16px] border border-line bg-[#fcfdfe] p-5">
        <div className="flex flex-col items-center gap-1.5 text-center">
          {logo ? (
            <img src={logo} alt="" className="h-10 max-w-[180px] object-contain" />
          ) : (
            <span className="font-display text-[18px] font-extrabold uppercase text-ink">{name || t("Your company")}</span>
          )}
          {logo && <span className="font-display text-[13px] font-extrabold uppercase text-ink">{name}</span>}
          <span className="text-[10px] font-semibold tracking-[0.18em] text-accent">{t("CERTIFICATE OF COMPLETION")}</span>
          <span className="text-[9.5px] text-muted">{t("issued in partnership with ABRANY")}</span>
        </div>
      </div>

      {msg && <p className="text-[12px] text-muted">{msg}</p>}
      <div>
        <button
          onClick={save}
          disabled={busy}
          className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? t("Saving…") : t("Save branding")}
        </button>
      </div>
    </div>
  );
}

/* ── API & MCP tab ─────────────────────────────────────────── */

function ApiTab({ org, refresh }: { org: OrgView; refresh: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const key = org.apiKey ?? "";
  const base = typeof window !== "undefined" ? window.location.origin : "https://abrany.app";

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const mcpUrl = `${base}/api/mcp/${key}`; // domain-aware connector link (key embedded)
  const mcpCmd = `claude mcp add --transport http abrany ${base}/api/mcp --header "Authorization: Bearer ${key}"`;
  const curlCmd = `curl -X POST ${base}/api/v1/assignments \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "employee@yourco.com",
    "title": "Forklift safety certification",
    "dueAt": "2026-08-01",
    "milestones": [{
      "title": "Pre-operation checks",
      "lessons": [{ "title": "Daily inspection walkthrough", "content": "# Your AI-authored lesson…" }]
    }]
  }'`;

  const host = base.replace(/^https?:\/\//, "");

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[12.5px] leading-relaxed text-muted">
        {rich(
          t("Connect Abrany to {claude} (or any MCP client) and just {talk} — “sign up Priya and assign her forklift safety, due Aug 1” — and it enrolls employees, writes the whole curriculum with whatever AI model you run, sets deadlines and reads back live progress. No code required."),
          {
            claude: <span className="font-semibold text-ink">Claude</span>,
            talk: <span className="font-semibold text-ink">{t("talk to it")}</span>,
          },
        )}
      </p>

      {/* ── The connector link (domain-aware) ─────────────────── */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t("Your connector link")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-[12px] border border-line bg-white/70 px-3.5 py-2.5 font-mono text-[11.5px] text-ink">
            {mcpUrl}
          </code>
          <button onClick={() => copy("url", mcpUrl)} className="glassx rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink">
            {copied === "url" ? t("Copied ✓") : t("Copy link")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          {rich(
            t("Points at {host} — it updates automatically if you move Abrany to your own domain. The key is baked in, so {password}. Paste it once and Claude stays connected."),
            {
              host: <span className="font-semibold text-ink">{host}</span>,
              password: <span className="font-semibold text-ink">{t("treat this link like a password")}</span>,
            },
          )}
        </p>
      </div>

      {/* ── Walkthrough ───────────────────────────────────────── */}
      <div className="rounded-[16px] border border-line bg-white/50 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t("Add it to Claude — pick your app")}
        </p>

        <div className="flex flex-col gap-4">
          {/* claude.ai / Claude Desktop */}
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-ink">{t("Claude.ai or Claude Desktop")}</p>
            <ol className="ml-4 list-decimal space-y-1 text-[12px] leading-relaxed text-muted marker:text-muted/60">
              <li>{rich(t("Open {path}."), { path: <span className="font-medium text-ink">{t("Settings → Connectors")}</span> })}</li>
              <li>{rich(t("Click {button}."), { button: <span className="font-medium text-ink">{t("Add custom connector")}</span> })}</li>
              <li>
                {rich(t("Name it {name} and paste the connector link above as the URL."), {
                  name: <span className="font-medium text-ink">Abrany</span>,
                })}
              </li>
              <li>{t("Save. Now just ask Claude to enroll people or assign courses.")}</li>
            </ol>
          </div>

          <div className="h-px bg-line" />

          {/* Claude Code */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[12.5px] font-semibold text-ink">{t("Claude Code (terminal)")}</p>
              <button onClick={() => copy("mcp", mcpCmd)} className="text-[11.5px] font-semibold text-accent">
                {copied === "mcp" ? t("Copied ✓") : t("Copy command")}
              </button>
            </div>
            <p className="mb-1.5 text-[12px] leading-relaxed text-muted">{t("One command — it uses a header instead of the link:")}</p>
            <pre className="overflow-x-auto rounded-[12px] border border-line bg-ink p-3.5 font-mono text-[11px] leading-relaxed text-white/90">
              {mcpCmd}
            </pre>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          {rich(
            t("Once connected, Claude can: {team}, {signup}, {assign} (full curriculum + deadline) and {progress} — reading time per section, exam scores and pass/fail."),
            {
              team: <span className="text-ink">{t("see your team")}</span>,
              signup: <span className="text-ink">{t("sign up an employee")}</span>,
              assign: <span className="text-ink">{t("assign a course")}</span>,
              progress: <span className="text-ink">{t("read live progress")}</span>,
            },
          )}
        </p>
      </div>

      {/* ── The key + rotate ──────────────────────────────────── */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("Partner API key")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-[12px] border border-line bg-white/70 px-3.5 py-2.5 font-mono text-[11.5px] text-ink">
            {key}
          </code>
          <button onClick={() => copy("key", key)} className="glassx rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink">
            {copied === "key" ? t("Copied ✓") : t("Copy")}
          </button>
          <button
            onClick={async () => {
              await api("/api/orgs/key", { method: "POST" }).catch(() => {});
              refresh();
            }}
            className="rounded-full px-2 py-2 text-[12px] font-semibold text-muted hover:text-accent"
            title={t("Rotate the key (the old link and key stop working immediately)")}
          >
            {t("Rotate")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          {t("This is the same key embedded in your connector link. Rotating it disconnects Claude until you paste the new link.")}
        </p>
      </div>

      {/* ── Developer REST (secondary) ────────────────────────── */}
      <details className="rounded-[16px] border border-line bg-white/40 p-4">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-ink">
          {t("Prefer raw HTTP? REST API for developers")}
        </summary>
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("Example — create an assignment")}</p>
            <button onClick={() => copy("curl", curlCmd)} className="text-[11.5px] font-semibold text-accent">
              {copied === "curl" ? t("Copied ✓") : t("Copy")}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-[12px] border border-line bg-ink p-3.5 font-mono text-[11px] leading-relaxed text-white/90">
            {curlCmd}
          </pre>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            {rich(
              t("Also: GET /api/v1/members · POST /api/v1/members · GET /api/v1/assignments · GET /api/v1/assignments/:id (per-section reading time, grades, exams) · GET /api/v1/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD (per member per UTC day: {shape} — pomodoros = completed focus sessions of 25+ minutes, ad-hoc ones included; a member-day with no focus sessions has no row, i.e. zero; both dates are required and inclusive, up to 366 days per call). Authenticate with {auth}."),
              {
                shape: "{ email, date, pomodoros, focusSec }",
                auth: <span className="font-mono text-ink">Authorization: Bearer {"{key}"}</span>,
              },
            )}
          </p>
        </div>
      </details>
    </div>
  );
}
