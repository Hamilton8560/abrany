import TokenResetForm from "@/components/TokenResetForm";

export const dynamic = "force-dynamic";

/** Public: set a new password from a single-use reset link (works whether or not you're signed in). */
export default async function ResetWithTokenPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <TokenResetForm token={(token ?? "").toString()} />;
}
