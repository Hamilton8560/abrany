"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type U = { id: number; email: string; is_owner: number; language: string };

/** Owner-only: pick a user to act as. Creating anything then saves to their account. */
export default function InstructorPanel() {
  const [users, setUsers] = useState<U[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    api<{ users: U[] }>("/api/admin/users")
      .then((d) => setUsers(d.users))
      .catch(() => setUsers([]));
  }, []);

  const actAs = async (u: U) => {
    setBusyId(u.id);
    try {
      await api("/api/admin/impersonate", { method: "POST", body: JSON.stringify({ userId: u.id }) });
      window.location.href = "/app"; // reload as the impersonated user
    } catch {
      setBusyId(null);
    }
  };

  const others = (users ?? []).filter((u) => !u.is_owner);

  return (
    <section className="glass rounded-[var(--radius-card-lg)] p-6">
      <p className="text-[15px] font-semibold text-ink">Instructor — act as a user</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Build goals, plans, lessons, and content on behalf of anyone who&apos;s signed up. While acting
        as them, everything you create is saved to their account and generated in their language. Use
        &ldquo;Stop&rdquo; in the top banner to return to yourself.
      </p>
      {users === null ? (
        <p className="mt-4 text-[13px] text-muted">Loading users…</p>
      ) : others.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">No other users have signed up yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {others.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-[12px] bg-white/60 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{u.email}</p>
                <p className="text-[11px] uppercase text-muted">{(u.language || "en").toUpperCase()}</p>
              </div>
              <button
                onClick={() => actAs(u)}
                disabled={busyId === u.id}
                className="glassx-dark shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
              >
                {busyId === u.id ? "Switching…" : "Act as"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
