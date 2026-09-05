"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Render children at the end of <body>. Every overlay in the app must use this:
 * the glass cards use backdrop-filter, which makes them the containing block for
 * `position: fixed` descendants — so a modal rendered inside a card was pinned to
 * the card, not the viewport, and opened off-screen whenever the page was scrolled
 * (the user saw only the blurred backdrop).
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
