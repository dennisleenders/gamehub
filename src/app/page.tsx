import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VaultApp from "@/components/VaultApp";

// Server Component: the middleware already gates auth, but we resolve the
// user + their profile here and pass them to the client app as initial props.
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return <VaultApp currentUser={profile ?? { id: user.id, name: "Player", color: "#6fc7b3" }} />;
}
