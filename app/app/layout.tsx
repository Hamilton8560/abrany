import type { Metadata } from "next";
import Sidebar, { MobileBar } from "@/components/app/Sidebar";

export const metadata: Metadata = {
  title: "Abrany — Train",
  description: "Record your training, set goals, and coach with AI.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1440px]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        <main className="flex-1 px-5 pb-24 pt-6 sm:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}
