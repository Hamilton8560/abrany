"use client";

import { useState } from "react";

/** Print/save-as-PDF and copy-the-verify-link actions for a credential. */
export default function CredentialActions({ verifyUrl }: { verifyUrl: string }) {
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
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={copy}
        className="glassx rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink"
      >
        {copied ? "Link copied ✓" : "Copy verify link"}
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
