"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Nav";
import QueueBadge from "./QueueBadge";
import {
  HomeIcon,
  TimerIcon,
  TargetIcon,
  ChatIcon,
  JournalIcon,
  ReviewIcon,
  SlidesIcon,
  BookIcon,
  SettingsIcon,
  MoreIcon,
  AwardIcon,
} from "@/components/icons";
import type { ComponentType, SVGProps } from "react";
import type { PublicUser } from "@/lib/user";

type NavItem = { href: string; label: string; short?: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

const NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", short: "Home", Icon: HomeIcon },
  { href: "/app/timer", label: "Focus Timer", short: "Timer", Icon: TimerIcon },
  { href: "/app/goals", label: "Goals & Plans", short: "Goals", Icon: TargetIcon },
  { href: "/app/review", label: "Review", short: "Review", Icon: ReviewIcon },
  { href: "/app/coach", label: "Coach", short: "Coach", Icon: ChatIcon },
  { href: "/app/presentations", label: "Presentations", short: "Slides", Icon: SlidesIcon },
  { href: "/app/books", label: "Books", short: "Books", Icon: BookIcon },
  { href: "/app/achievements", label: "Achievements", short: "Awards", Icon: AwardIcon },
  { href: "/app/log", label: "Training Log", short: "Log", Icon: JournalIcon },
];

// Phone bottom bar shows 4 primaries + a "More" sheet holding the rest + Settings.
const MOBILE_PRIMARY = ["/app", "/app/timer", "/app/goals", "/app/coach"];

/** Poll the number of lessons due for spaced review (for the nav badge). */
function useDueCount() {
  const [due, setDue] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch("/api/reviews", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && setDue(d.summary?.dueToday ?? 0))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return due;
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export default function Sidebar({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const due = useDueCount();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-8 p-5 lg:flex print:!hidden">
      <div className="glass flex h-full min-h-0 flex-col gap-7 overflow-hidden rounded-[var(--radius-card-lg)] p-5">
        <div className="shrink-0 px-1 pt-1">
          <Logo />
        </div>

        <nav className="-mr-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-2">
          {NAV.map(({ href, label, Icon }) => {
            const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 rounded-[13px] px-3 py-2.5 text-[13.5px] transition-all ${
                  active
                    ? "glassx-dark font-semibold text-white"
                    : "font-medium text-muted hover:bg-white/50 hover:text-ink"
                }`}
              >
                <Icon className={`size-[18px] ${active ? "text-white" : "text-muted group-hover:text-ink"}`} />
                <span className="flex-1">{label}</span>
                {href === "/app/review" && due > 0 && (
                  <span
                    className={`grid min-w-[20px] place-items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${
                      active ? "bg-white/25 text-white" : "bg-accent text-white"
                    }`}
                  >
                    {due}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 flex-col gap-3">
          <QueueBadge />
          <Link
            href="/app/settings"
            className={`flex items-center gap-3 rounded-[13px] px-3 py-2.5 text-[13.5px] transition-all ${
              pathname.startsWith("/app/settings")
                ? "glassx-dark font-semibold text-white"
                : "font-medium text-muted hover:bg-white/50 hover:text-ink"
            }`}
          >
            <SettingsIcon className="size-[18px]" />
            AI & Settings
            {!user.canUseAi && <span className="ml-auto size-2 rounded-full bg-accent" />}
          </Link>
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-medium text-ink">{user.email}</p>
              <p className="text-[10px] text-muted">
                {user.isOwner
                  ? "Owner · built-in AI"
                  : user.hasKey
                    ? user.provider || "your key"
                    : user.freeAiAccess
                      ? "free shared AI"
                      : "add your AI key"}
              </p>
            </div>
            <button
              onClick={logout}
              className="shrink-0 text-[11px] font-semibold text-muted hover:text-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Compact top bar + bottom tab bar for mobile (sidebar hidden below lg). */
export function MobileBar({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const due = useDueCount();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.href));
  const overflow = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href));
  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  const moreActive = overflow.some((n) => isActive(n.href)) || pathname.startsWith("/app/settings");

  return (
    <>
      <div className="glassx sticky top-0 z-40 flex items-center justify-between px-5 py-3 lg:hidden print:hidden">
        <Logo compact />
        <QueueBadge />
      </div>

      {/* Bottom tab bar: 4 primaries + More */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white/80 px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden print:hidden">
        {primary.map(({ href, short, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-medium ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <span className="relative">
                <Icon className="size-[20px]" />
                {href === "/app/review" && due > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid min-w-[15px] place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
                    {due}
                  </span>
                )}
              </span>
              {short ?? label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-medium ${
            moreActive ? "text-accent" : "text-muted"
          }`}
        >
          <span className="relative">
            <MoreIcon className="size-[20px]" />
            {due > 0 && !primary.some((n) => n.href === "/app/review") && (
              <span className="absolute -right-2 -top-1.5 grid min-w-[15px] place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
                {due}
              </span>
            )}
          </span>
          More
        </button>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[24px] border-t border-line bg-white/95 p-5 pb-[max(20px,env(safe-area-inset-bottom))] backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <div className="grid grid-cols-3 gap-2.5">
              {overflow.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-2 rounded-[16px] px-2 py-4 text-center text-[11.5px] font-medium ${
                      active ? "glassx-dark text-white" : "glassx text-ink"
                    }`}
                  >
                    <Icon className={`size-[22px] ${active ? "text-white" : "text-muted"}`} />
                    <span className="leading-tight">{label}</span>
                    {href === "/app/review" && due > 0 && (
                      <span className="rounded-full bg-accent px-1.5 text-[9px] font-bold text-white">{due} due</span>
                    )}
                  </Link>
                );
              })}
              <Link
                href="/app/settings"
                onClick={() => setMoreOpen(false)}
                className={`flex flex-col items-center gap-2 rounded-[16px] px-2 py-4 text-center text-[11.5px] font-medium ${
                  pathname.startsWith("/app/settings") ? "glassx-dark text-white" : "glassx text-ink"
                }`}
              >
                <SettingsIcon className={`size-[22px] ${pathname.startsWith("/app/settings") ? "text-white" : "text-muted"}`} />
                <span className="leading-tight">AI &amp; Settings</span>
                {!user.canUseAi && <span className="size-1.5 rounded-full bg-accent" />}
              </Link>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-ink">{user.email}</p>
                <p className="text-[10.5px] text-muted">
                  {user.isOwner
                    ? "Owner · built-in AI"
                    : user.hasKey
                      ? user.provider || "your key"
                      : user.freeAiAccess
                        ? "free shared AI"
                        : "add your AI key"}
                </p>
              </div>
              <button
                onClick={logout}
                className="shrink-0 rounded-full glassx px-4 py-2 text-[12px] font-semibold text-muted"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
