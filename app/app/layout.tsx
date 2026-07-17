import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Sidebar, { MobileBar } from "@/components/app/Sidebar";
import ImpersonationBanner from "@/components/app/ImpersonationBanner";
import { getAuthState } from "@/lib/auth";
import { publicUser } from "@/lib/user";
import { ensureWeeklyReportScheduler } from "@/lib/weeklyReport";

export const metadata: Metadata = {
  title: "Abrany — Train",
  description: "Record your training, set goals, and coach with AI.",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  ensureWeeklyReportScheduler();
  const { effective, impersonating } = await getAuthState();
  if (!effective) redirect("/login");
  // signed up by a company with a temporary password — must set their own before using the app
  if (effective.must_reset_password) redirect("/reset-password");
  const me = publicUser(effective);

  return (
    <div className="flex min-h-dvh flex-col">
      {impersonating && <ImpersonationBanner email={effective.email} />}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        <Sidebar user={me} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileBar user={me} />
          <main className="flex-1 px-5 pb-24 pt-6 sm:px-8 lg:pb-10 lg:pt-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
