import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingFlow from "@/components/OnboardingFlow";

// Where a signed-in but vault-less user lands. If they already belong to a
// household we bounce straight to the app — this, paired with middleware
// exempting /onboarding, makes the create-vault gate loop-free.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership) redirect("/");

  const { invite } = await searchParams;
  return <OnboardingFlow initialInvite={invite ?? ""} />;
}
