"use client";

import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n/client";

// The 3D scene is heavy (three + drei + postprocessing), so it's client-only and
// lazy-loaded — it never touches the bundle of any other route.
const MindScene = dynamic(() => import("@/components/app/MindScene"), {
  ssr: false,
  loading: () => <MindLoading />,
});

function MindLoading() {
  const t = useT();
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0f16", display: "grid", placeItems: "center", zIndex: 60 }}>
      <p style={{ color: "#8891a0", font: "500 14px -apple-system,system-ui" }}>{t("Entering your mind…")}</p>
    </div>
  );
}

export default function MindPage() {
  return <MindScene />;
}
