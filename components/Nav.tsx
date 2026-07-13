"use client";

import { useEffect, useState } from "react";
import { BrainGlyph } from "./icons";

const LINKS = ["Home", "Courses", "Trainers", "Pricing"];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="#top" className="flex items-center gap-[9px]" aria-label="Abrany home">
      <span
        className="grid place-items-center rounded-full bg-ink text-white"
        style={{ width: compact ? 22 : 24, height: compact ? 22 : 24 }}
      >
        <BrainGlyph style={{ width: compact ? 11 : 12, height: compact ? 11 : 12 }} />
      </span>
      <span
        className="font-sans font-semibold text-ink"
        style={{ fontSize: compact ? 14 : 15, letterSpacing: "3px" }}
      >
        ABRANY
      </span>
    </a>
  );
}

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close the mobile menu on Escape, and lock body scroll while it's open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open ? "glassx" : ""
      }`}
    >
      <nav className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-6 md:px-20">
        <Logo />

        <div className="hidden items-center gap-9 text-[14px] md:flex">
          {LINKS.map((l, i) => (
            <a
              key={l}
              href="#top"
              className={
                i === 0
                  ? "font-medium text-ink"
                  : "font-normal text-muted transition-colors hover:text-ink"
              }
            >
              {l}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-[18px]">
          <a
            href="#footer"
            className="hidden font-semibold text-ink sm:block"
            style={{ fontSize: 11.5, letterSpacing: "1.61px" }}
          >
            CONTACT US
          </a>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="glassx flex size-[38px] flex-col items-center justify-center gap-[5px] rounded-full md:hidden"
          >
            <span
              className={`block h-[1.5px] w-4 bg-ink transition-transform duration-300 ${
                open ? "translate-y-[3.25px] rotate-45" : ""
              }`}
            />
            <span
              className={`block h-[1.5px] w-4 bg-ink transition-transform duration-300 ${
                open ? "-translate-y-[3.25px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </nav>

      {/* mobile menu */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 md:hidden ${
          open ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-1 px-6 pb-5 pt-1">
          {LINKS.map((l, i) => (
            <a
              key={l}
              href="#top"
              onClick={() => setOpen(false)}
              className={`rounded-[12px] px-2 py-3 text-[16px] ${
                i === 0 ? "font-semibold text-ink" : "font-medium text-muted"
              }`}
            >
              {l}
            </a>
          ))}
          <a
            href="#footer"
            onClick={() => setOpen(false)}
            className="mt-2 flex items-center justify-center rounded-full bg-ink px-6 py-[13px] text-[15px] font-semibold text-white"
          >
            Contact Us
          </a>
        </div>
      </div>
    </header>
  );
}
