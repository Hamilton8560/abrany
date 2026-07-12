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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "glassx" : ""
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
            aria-label="Menu"
            className="glassx flex flex-col items-center gap-1 rounded-full px-[9px] py-[11px]"
          >
            <span className="block h-[1.5px] w-4 bg-ink" />
            <span className="block h-[1.5px] w-4 bg-ink" />
          </button>
        </div>
      </nav>
    </header>
  );
}
