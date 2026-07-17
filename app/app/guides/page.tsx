import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listGoals } from "@/lib/repo";
import GuidesPanel from "@/components/app/GuidesPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GuidesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const goals = listGoals(user.id).map((g) => ({ id: g.id, title: g.title }));

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-7">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            STUDY GUIDES
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(28px,4vw,40px)] font-extrabold uppercase leading-[0.98] text-ink">
          Your study guides
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Generate a keepable revision guide for a course or any topic, come back to it anytime, and
          talk it through with your tutor.
        </p>
      </header>
      <GuidesPanel goals={goals} />
    </div>
  );
}
