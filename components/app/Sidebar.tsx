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
} from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

const NAV: { href: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/app", label: "Dashboard", Icon: HomeIcon },
  { href: "/app/timer", label: "Focus Timer", Icon: TimerIcon },
  { href: "/app/goals", label: "Goals & Plans", Icon: TargetIcon },
  { href: "/app/review", label: "Review", Icon: ReviewIcon },
  { href: "/app/coach", label: "Coach", Icon: ChatIcon },
  { href: "/app/presentations", label: "Presentations", Icon: SlidesIcon },
  { href: "/app/books", label: "Books", Icon: BookIcon },
  { href: "/app/log", label: "Training Log", Icon: JournalIcon },
];

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

export default function Sidebar() {
  const pathname = usePathname();
  const due = useDueCount();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-8 p-5 lg:flex">
      <div className="glass flex h-full flex-col gap-7 rounded-[var(--radius-card-lg)] p-5">
        <div className="px-1 pt-1">
          <Logo />
        </div>

        <nav className="flex flex-1 flex-col gap-1.5">
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

        <div className="flex flex-col gap-3">
          <QueueBadge />
          <p className="px-1 text-[10.5px] leading-relaxed text-muted/80">
            Powered by MiniMax M3 · your training data lives locally.
          </p>
        </div>
      </div>
    </aside>
  );
}

/** Compact top bar for mobile (sidebar hidden below lg). */
export function MobileBar() {
  const pathname = usePathname();
  return (
    <div className="glassx sticky top-0 z-40 flex items-center justify-between px-5 py-3 lg:hidden">
      <Logo compact />
      <div className="flex items-center gap-3">
        <QueueBadge />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-white/70 px-2 py-2 backdrop-blur-xl">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <Icon className="size-[19px]" />
              {label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
