"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtDuration } from "@/lib/client";
import { BuildingIcon, CheckIcon, PlusIcon } from "@/components/icons";

/* ── types mirrored from the org API ───────────────────────── */

type OrgView = { id: number; name: string; logo: string; tagline: string; createdAt: string; apiKey?: string };
type Member = { user_id: number; role: "admin" | "member"; email: string; display_name: string; created_at: string };
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

const fmtDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + (iso.includes("Z") || iso.includes("+") ? "" : "Z")).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );

const daysLeft = (dueIso: string) =>
  Math.ceil((new Date(dueIso).getTime() - Date.now()) / 86_400_000);

function StatusChip({ status, late }: { status: Progress["status"]; late?: boolean }) {
  const map = {
    passed: ["bg-up/15 text-up", late ? "Passed (late)" : "Passed"],
    failed: ["bg-accent/15 text-accent", "Failed — past due"],
    in_progress: ["bg-ink/10 text-ink", "In progress"],
    assigned: ["glassx text-muted", "Assigned"],
  } as const;
  const [cls, label] = map[status];
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
  const [data, setData] = useState<OrgState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api<OrgState>("/api/orgs"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your organization");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error) return <p className="text-[13px] text-accent">{error}</p>;
  if (!data) return <p className="text-[13px] text-muted">Loading…</p>;

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
  return (
    <section className="glass rounded-[var(--radius-card-lg)] p-5 sm:p-6">
      <h2 className="font-display text-[16px] font-extrabold uppercase text-ink">Assigned to you</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        Education your company assigned. It lives with your own goals — study it the same way.
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
                        Due {fmtDate(a.due_at)}
                        {dl !== null && a.status !== "passed" && (dl >= 0 ? ` · ${dl}d left` : " · overdue")}
                      </span>
                    )}
                    {a.note && <span>“{a.note}”</span>}
                  </p>
                </Link>
                <div className="flex items-center gap-3">
                  <ProgressBar done={a.sections_done} total={a.sections_total} />
                  <StatusChip status={a.status} late={!!a.passed_late} />
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
          {org.tagline || "You're a member. Training your company assigns appears above and with your goals."}
        </p>
      </div>
    </section>
  );
}

/* ── no org yet ────────────────────────────────────────────── */

function CreateOrg({ onCreated }: { onCreated: () => void }) {
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
      setErr(e instanceof Error ? e.message : "Could not create the organization");
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
        <h2 className="font-display text-[18px] font-extrabold uppercase text-ink">Set up your company</h2>
        <p className="mx-auto mt-1 max-w-[420px] text-[13px] text-muted">
          Sign employees up, assign curricula with deadlines, track reading time per section with a
          clear pass/fail, connect any AI over API/MCP, and put your logo on the certificates.
        </p>
      </div>
      <div className="flex w-full max-w-[380px] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Company name — e.g. American Iron"
          className="min-w-0 flex-1 rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="glassx-dark shrink-0 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
      {err && <p className="text-[12.5px] text-accent">{err}</p>}
      <p className="text-[11.5px] text-muted">
        Just here to learn? Nothing changes — your personal goals stay yours. If your employer invited
        you, you joined automatically at signup.
      </p>
    </section>
  );
}

/* ── admin panel ───────────────────────────────────────────── */

type Tab = "assignments" | "team" | "branding" | "api";

function AdminPanel({ data, refresh }: { data: OrgState; refresh: () => void }) {
  const [tab, setTab] = useState<Tab>("assignments");
  const org = data.org!;
  const admin = data.admin!;

  const tabs: { id: Tab; label: string }[] = [
    { id: "assignments", label: "Assignments" },
    { id: "team", label: `Team (${admin.members.length})` },
    { id: "branding", label: "Branding" },
    { id: "api", label: "API & MCP" },
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
            <p className="text-[11.5px] text-muted">{org.tagline || "Admin · manage training below"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                tab === t.id ? "glassx-dark text-white" : "glassx text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {tab === "assignments" && <AssignmentsTab members={admin.members} assignments={admin.assignments} refresh={refresh} />}
        {tab === "team" && <TeamTab members={admin.members} invites={admin.invites} refresh={refresh} />}
        {tab === "branding" && <BrandingTab org={org} refresh={refresh} />}
        {tab === "api" && <ApiTab org={org} refresh={refresh} />}
      </div>
    </section>
  );
}

/* ── team tab ──────────────────────────────────────────────── */

function TeamTab({ members, invites, refresh }: { members: Member[]; invites: Invite[]; refresh: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const add = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ status: string }>("/api/orgs/members", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMsg(
        r.status === "added"
          ? "Added — they'll see assigned training on their Company page. We emailed them a heads-up."
          : r.status === "created"
            ? "Signed up — we emailed them a temporary password. They'll set their own the moment they log in."
            : "Already a member.",
      );
      setEmail("");
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not add that person");
    } finally {
      setBusy(false);
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
          <PlusIcon className="size-4" /> Sign up
        </button>
      </div>
      {msg && <p className="text-[12px] text-muted">{msg}</p>}

      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between gap-3 rounded-[14px] bg-white/60 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-ink">{m.display_name}</p>
              <p className="truncate text-[11.5px] text-muted">{m.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-ink/8 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-muted">
                {m.role}
              </span>
              {m.role !== "admin" && (
                <button
                  onClick={async () => {
                    await api(`/api/orgs/members/${m.user_id}`, { method: "DELETE" }).catch(() => {});
                    refresh();
                  }}
                  className="text-[11.5px] font-semibold text-muted hover:text-accent"
                >
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Pending invites</p>
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
                  Revoke
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
  const [showForm, setShowForm] = useState(assignments.length === 0);
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

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
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the assignment");
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
          The employee gets the course as a goal of their own; you see time, progress and pass/fail here.
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="glassx flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink"
        >
          <PlusIcon className="size-4" /> Assign education
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
              <option value="">Choose an employee…</option>
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
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What should they learn? e.g. OSHA 10 refresher, TIG welding fundamentals"
            className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional context for the AI curriculum (level, focus areas, what 'good' looks like)…"
            rows={2}
            className="rounded-[16px] border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note the employee sees, e.g. 'Required before the March site visit'"
            className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          {err && <p className="text-[12px] text-accent">{err}</p>}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted">
              Want to author the full curriculum with your own AI? Use the API & MCP tab.
            </p>
            <button
              onClick={create}
              disabled={busy || !email || !title.trim()}
              className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Assigning…" : "Assign"}
            </button>
          </div>
        </div>
      )}

      {assignments.length === 0 && !showForm && (
        <p className="py-6 text-center text-[13px] text-muted">No assignments yet.</p>
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
                        Due {fmtDate(a.due_at)}
                        {dl !== null && a.status !== "passed" && (dl >= 0 ? ` · ${dl}d left` : "")}
                      </span>
                    )}
                    <span>Read {fmtDuration(a.read_sec)}</span>
                    <span>Focus {fmtDuration(a.focus_sec)}</span>
                    {a.exam_best > 0 && <span>Final {a.exam_best}%</span>}
                  </p>
                </button>
                <div className="flex items-center gap-3">
                  <ProgressBar done={a.sections_done} total={a.sections_total} />
                  <StatusChip status={a.status} late={!!a.passed_late} />
                  <button
                    onClick={async () => {
                      await api(`/api/orgs/assignments/${a.id}`, { method: "DELETE" }).catch(() => {});
                      refresh();
                    }}
                    title="Stop tracking (the employee keeps the course)"
                    className="text-[11.5px] font-semibold text-muted hover:text-accent"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {openDetail === a.id && (
                <div className="mt-3 border-t border-line/60 pt-3">
                  {!detail ? (
                    <p className="text-[12px] text-muted">Loading detail…</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[12px]">
                        <thead>
                          <tr className="text-[10.5px] uppercase tracking-wide text-muted">
                            <th className="py-1.5 pr-3 font-semibold">Section</th>
                            <th className="py-1.5 pr-3 font-semibold">Kind</th>
                            <th className="py-1.5 pr-3 font-semibold">Reading time</th>
                            <th className="py-1.5 pr-3 font-semibold">Done</th>
                            <th className="py-1.5 font-semibold">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.sections.map((s, i) => (
                            <tr key={i} className="border-t border-line/50">
                              <td className="max-w-[280px] truncate py-1.5 pr-3 text-ink">{s.title}</td>
                              <td className="py-1.5 pr-3 capitalize text-muted">{s.kind}</td>
                              <td className="py-1.5 pr-3 text-muted">{s.readingSec ? fmtDuration(s.readingSec) : "—"}</td>
                              <td className="py-1.5 pr-3">
                                {s.completedAt ? <CheckIcon className="size-3.5 text-up" /> : <span className="text-muted">—</span>}
                              </td>
                              <td className="py-1.5 text-ink">{s.grade || "—"}</td>
                            </tr>
                          ))}
                          {detail.exams.map((e, i) => (
                            <tr key={`e${i}`} className="border-t border-line/50 font-semibold">
                              <td className="py-1.5 pr-3 capitalize text-ink">{e.kind} exam</td>
                              <td className="py-1.5 pr-3 text-muted">exam</td>
                              <td className="py-1.5 pr-3 text-muted">{e.attempts} attempt{e.attempts === 1 ? "" : "s"}</td>
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
  const [name, setName] = useState(org.name);
  const [tagline, setTagline] = useState(org.tagline);
  const [logo, setLogo] = useState(org.logo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 300_000) {
      setMsg("Logo too large — keep it under 300 KB (PNG/SVG with transparency looks best).");
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
      setMsg("Saved. New certificates from assigned training now carry your brand.");
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save branding");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-muted">
        Certificates earned from training you assign are issued under your brand — your logo and name
        up top, “in partnership with Abrany” beneath. Employees and anyone verifying see both.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Tagline (shown under your name), e.g. Training & Safety"
          className="rounded-full border border-line bg-white/70 px-4 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="glassx cursor-pointer rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-ink">
          {logo ? "Replace logo" : "Upload logo"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
        </label>
        {logo && (
          <>
            <img src={logo} alt="logo preview" className="h-12 max-w-[160px] object-contain" />
            <button onClick={() => setLogo("")} className="text-[11.5px] font-semibold text-muted hover:text-accent">
              Remove
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
            <span className="font-display text-[18px] font-extrabold uppercase text-ink">{name || "Your company"}</span>
          )}
          {logo && <span className="font-display text-[13px] font-extrabold uppercase text-ink">{name}</span>}
          <span className="text-[10px] font-semibold tracking-[0.18em] text-accent">CERTIFICATE OF COMPLETION</span>
          <span className="text-[9.5px] text-muted">issued in partnership with ABRANY</span>
        </div>
      </div>

      {msg && <p className="text-[12px] text-muted">{msg}</p>}
      <div>
        <button
          onClick={save}
          disabled={busy}
          className="glassx-dark rounded-full px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save branding"}
        </button>
      </div>
    </div>
  );
}

/* ── API & MCP tab ─────────────────────────────────────────── */

function ApiTab({ org, refresh }: { org: OrgView; refresh: () => void }) {
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
        Connect Abrany to <span className="font-semibold text-ink">Claude</span> (or any MCP client) and
        just <span className="font-semibold text-ink">talk to it</span> — “sign up Priya and assign her
        forklift safety, due Aug 1” — and it enrolls employees, writes the whole curriculum with whatever
        AI model you run, sets deadlines and reads back live progress. No code required.
      </p>

      {/* ── The connector link (domain-aware) ─────────────────── */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Your connector link
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-[12px] border border-line bg-white/70 px-3.5 py-2.5 font-mono text-[11.5px] text-ink">
            {mcpUrl}
          </code>
          <button onClick={() => copy("url", mcpUrl)} className="glassx rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink">
            {copied === "url" ? "Copied ✓" : "Copy link"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          Points at <span className="font-semibold text-ink">{host}</span> — it updates automatically if
          you move Abrany to your own domain. The key is baked in, so
          <span className="font-semibold text-ink"> treat this link like a password</span>. Paste it once
          and Claude stays connected.
        </p>
      </div>

      {/* ── Walkthrough ───────────────────────────────────────── */}
      <div className="rounded-[16px] border border-line bg-white/50 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Add it to Claude — pick your app
        </p>

        <div className="flex flex-col gap-4">
          {/* claude.ai / Claude Desktop */}
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-ink">Claude.ai or Claude Desktop</p>
            <ol className="ml-4 list-decimal space-y-1 text-[12px] leading-relaxed text-muted marker:text-muted/60">
              <li>Open <span className="font-medium text-ink">Settings → Connectors</span>.</li>
              <li>Click <span className="font-medium text-ink">Add custom connector</span>.</li>
              <li>Name it <span className="font-medium text-ink">Abrany</span> and paste the connector link above as the URL.</li>
              <li>Save. Now just ask Claude to enroll people or assign courses.</li>
            </ol>
          </div>

          <div className="h-px bg-line" />

          {/* Claude Code */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[12.5px] font-semibold text-ink">Claude Code (terminal)</p>
              <button onClick={() => copy("mcp", mcpCmd)} className="text-[11.5px] font-semibold text-accent">
                {copied === "mcp" ? "Copied ✓" : "Copy command"}
              </button>
            </div>
            <p className="mb-1.5 text-[12px] leading-relaxed text-muted">One command — it uses a header instead of the link:</p>
            <pre className="overflow-x-auto rounded-[12px] border border-line bg-ink p-3.5 font-mono text-[11px] leading-relaxed text-white/90">
              {mcpCmd}
            </pre>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Once connected, Claude can: <span className="text-ink">see your team</span>,
          <span className="text-ink"> sign up an employee</span>,
          <span className="text-ink"> assign a course</span> (full curriculum + deadline) and
          <span className="text-ink"> read live progress</span> — reading time per section, exam scores and pass/fail.
        </p>
      </div>

      {/* ── The key + rotate ──────────────────────────────────── */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Partner API key</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-[12px] border border-line bg-white/70 px-3.5 py-2.5 font-mono text-[11.5px] text-ink">
            {key}
          </code>
          <button onClick={() => copy("key", key)} className="glassx rounded-full px-3.5 py-2 text-[12px] font-semibold text-ink">
            {copied === "key" ? "Copied ✓" : "Copy"}
          </button>
          <button
            onClick={async () => {
              await api("/api/orgs/key", { method: "POST" }).catch(() => {});
              refresh();
            }}
            className="rounded-full px-2 py-2 text-[12px] font-semibold text-muted hover:text-accent"
            title="Rotate the key (the old link and key stop working immediately)"
          >
            Rotate
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          This is the same key embedded in your connector link. Rotating it disconnects Claude until you paste the new link.
        </p>
      </div>

      {/* ── Developer REST (secondary) ────────────────────────── */}
      <details className="rounded-[16px] border border-line bg-white/40 p-4">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-ink">
          Prefer raw HTTP? REST API for developers
        </summary>
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Example — create an assignment</p>
            <button onClick={() => copy("curl", curlCmd)} className="text-[11.5px] font-semibold text-accent">
              {copied === "curl" ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-[12px] border border-line bg-ink p-3.5 font-mono text-[11px] leading-relaxed text-white/90">
            {curlCmd}
          </pre>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Also: GET /api/v1/members · POST /api/v1/members · GET /api/v1/assignments ·
            GET /api/v1/assignments/:id (per-section reading time, grades, exams). Authenticate with
            <span className="font-mono text-ink"> Authorization: Bearer {"{key}"}</span>.
          </p>
        </div>
      </details>
    </div>
  );
}
