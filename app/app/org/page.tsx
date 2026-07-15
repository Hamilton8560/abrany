import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import OrgPanel from "@/components/app/OrgPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OrgPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-7">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            MY COMPANY
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(28px,4vw,40px)] font-extrabold uppercase leading-[0.98] text-ink">
          Team training
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Sign employees up, assign education with deadlines, track reading time and pass/fail — and
          white-label the certificates they earn.
        </p>
      </header>
      <OrgPanel />
    </div>
  );
}
