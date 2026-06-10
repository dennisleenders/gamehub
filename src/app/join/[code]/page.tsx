import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The canonical shareable invite link: /join/<code>. It works whether the
// visitor is logged out or in, and funnels everyone through the single
// onboarding RPC path:
//   logged out          → /login?invite=<code>   (code survives the sign-in)
//   logged in, no vault → /onboarding?invite=<code>
//   logged in, in a vault → / (they can only belong to one)
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?invite=${encodeURIComponent(code)}`);

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership) redirect("/");

  redirect(`/onboarding?invite=${encodeURIComponent(code)}`);
}
