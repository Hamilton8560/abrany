import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import FocusSession from "@/components/timer/FocusSession";

export const metadata: Metadata = {
  title: "Focus Timer — Abrany",
  description:
    "Run precision focus sessions with built-in breaks. Your timer follows you across the site and alerts you the moment a session ends.",
};

export default function FocusPage() {
  return (
    <main>
      <Nav />
      <FocusSession />
      <Footer />
    </main>
  );
}
