"use client";

import { useState } from "react";

type LinkedIn = { name: string; issueYear: number; issueMonth: number; certId: string };

/** Print/save-as-PDF, copy-the-verify-link, and add-to-LinkedIn actions. */
export default function CredentialActions({ verifyUrl, linkedin }: { verifyUrl: string; linkedin: LinkedIn }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const addToLinkedIn = () => {
    // LinkedIn "Add to profile" pre-fills the certification form; the user confirms on LinkedIn.
    const params = new URLSearchParams({
      startTask: "CERTIFICATION_NAME",
      name: linkedin.name,
      organizationName: "Abrany",
      issueYear: String(linkedin.issueYear),
      issueMonth: String(linkedin.issueMonth),
      certUrl: verifyUrl,
      certId: linkedin.certId,
    });
    window.open(`https://www.linkedin.com/profile/add?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={copy} className="glassx rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink">
        {copied ? "Link copied ✓" : "Copy verify link"}
      </button>
      <button
        onClick={addToLinkedIn}
        className="flex items-center gap-1.5 rounded-full bg-[#0a66c2] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#0958a8]"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5" aria-hidden>
          <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.75V21h-4v-5.6c0-1.34-.03-3.06-1.9-3.06-1.9 0-2.2 1.46-2.2 2.96V21h-4V9Z" />
        </svg>
        Add to LinkedIn
      </button>
      <button
        onClick={() => window.print()}
        className="glassx-dark rounded-full px-4 py-2 text-[12.5px] font-semibold text-white"
      >
        Download / print
      </button>
    </div>
  );
}
