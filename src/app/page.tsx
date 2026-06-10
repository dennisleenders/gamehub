import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VaultApp from "@/components/VaultApp";
import type { Household, HouseholdRole } from "@/lib/types";

// Server Component: middleware already gates auth + household membership, but we
// resolve the user, their profile and their household here and pass them to the
// client app as initial props.
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // One vault per user: the membership row carries the role and joins the
  // household record. No membership → they haven't onboarded yet.
  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("household_members")
      .select("role, household:households(*)")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!membership?.household) redirect("/onboarding");
  // The embedded resource comes back as an array shape from the typegen; it's a
  // single row here (one household per membership).
  const household = (Array.isArray(membership.household)
    ? membership.household[0]
    : membership.household) as Household;

  return (
    <VaultApp
      currentUser={profile ?? { id: user.id, name: "Player", color: "#6fc7b3" }}
      household={household}
      role={membership.role as HouseholdRole}
    />
  );
}
