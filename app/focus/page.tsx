import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import FocusSession from "@/components/timer/FocusSession";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("Focus Timer — Abrany"),
    description: t(
      "Run precision focus sessions with built-in breaks. Your timer follows you across the site and alerts you the moment a session ends.",
    ),
  };
}

export default function FocusPage() {
  return (
    <main>
      <Nav />
      <FocusSession />
      <Footer />
    </main>
  );
}
