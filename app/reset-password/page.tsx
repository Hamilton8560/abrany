import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import ResetPasswordForm from "@/components/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <ResetPasswordForm required={!!user.must_reset_password} />;
}
