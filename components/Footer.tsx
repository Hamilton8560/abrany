"use client";

import { motion } from "motion/react";
import { Logo } from "./Nav";
import { ArrowRight, XIcon, InstagramIcon, LinkedInIcon } from "./icons";

const LINKS = ["Features", "Pricing", "Trainers", "Method", "Journal", "Contact"];

function SocialButton({ children }: { children: React.ReactNode }) {
  return (
    <a
      href="#top"
      className="grid size-[38px] place-items-center rounded-full border border-line bg-white/60 text-muted transition-colors hover:border-transparent hover:bg-ink hover:text-white"
    >
      {children}
    </a>
  );
}

export default function Footer() {
  return (
    <footer id="footer" className="relative overflow-hidden px-6 pb-10 pt-20 md:px-20">
      {/* faint ABRANY watermark behind */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[-3%] select-none text-center font-display font-black uppercase leading-none text-ink/[0.045] [font-size:clamp(80px,20vw,280px)]"
      >
        ABRANY
      </span>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative mx-auto max-w-[1280px] rounded-[24px] p-8 md:p-12"
      >
        {/* CTA row */}
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <h2 className="font-display font-extrabold text-ink [font-size:clamp(28px,4vw,44px)] [line-height:1.05] [letter-spacing:-0.01em]">
            Ready to upgrade
            <br />
            your mind?
          </h2>
          <a
            href="#top"
            className="group inline-flex items-center gap-3 rounded-full bg-ink px-6 py-[15px] text-[15px] font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5"
          >
            Start Training
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </a>
        </div>

        <div className="my-8 h-px w-full bg-line" />

        {/* logo · links · socials */}
        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <Logo />

          <nav className="flex flex-wrap gap-x-8 gap-y-3 text-[14px] text-muted">
            {LINKS.map((l) => (
              <a key={l} href="#top" className="transition-colors hover:text-ink">
                {l}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <SocialButton>
              <XIcon className="size-4" />
            </SocialButton>
            <SocialButton>
              <InstagramIcon className="size-4" />
            </SocialButton>
            <SocialButton>
              <LinkedInIcon className="size-4" />
            </SocialButton>
          </div>
        </div>

        {/* copyright */}
        <div className="mt-8 flex flex-col gap-2 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Abrany. All rights reserved.</p>
          <p>Privacy · Terms · Cookies</p>
        </div>
      </motion.div>
    </footer>
  );
}
