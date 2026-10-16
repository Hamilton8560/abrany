import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import WorkshopPanel from "@/components/app/WorkshopPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WorkshopPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-7">
      <header>
        <div className="flex items-center gap-3">
          <span className="h-[2px] w-[26px] bg-accent" />
          <span className="text-[12px] font-medium text-accent" style={{ letterSpacing: "1.68px" }}>
            WORKSHOP · BETA
          </span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(28px,4vw,40px)] font-extrabold uppercase leading-[0.98] text-ink">
          Build it. Fix it.
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] text-muted">
          Describe a project or a problem — a block house, a tripping breaker, a treadmill that won&apos;t
          start — and get a step-by-step manual like the ones in a LEGO box: the tools and parts up front,
          a yes/no troubleshooting path to find the fault, then small numbered steps with a picture for
          each.
        </p>
      </header>
      <WorkshopPanel />
    </div>
  );
}
