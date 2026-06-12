import Splash from "@/components/Splash";

// Suspense fallback for the whole app segment. Next streams this the instant the
// shell is ready while page.tsx awaits its server data (Supabase auth + household
// lookup), so the gap between the native launch splash dismissing and the first
// real screen painting is filled with our own branded splash instead of a black
// screen. Covers /login and /onboarding too during the auth redirect chain.
export default function Loading() {
  return <Splash />;
}
