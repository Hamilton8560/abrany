import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { userOwnsManual } from "@/lib/workshop";
import ManualViewer from "@/components/app/ManualViewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ManualPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = Number((await params).id);
  if (!userOwnsManual(user.id, id)) notFound();
  return (
    <div className="manual-root mx-auto flex max-w-[1080px] flex-col gap-6">
      <ManualViewer id={id} />
    </div>
  );
}
