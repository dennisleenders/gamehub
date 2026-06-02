import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Components, Server Actions, and Route Handlers use this.
// Uses the modern getAll/setAll cookie interface (the old get/set/remove
// signature is deprecated and breaks SSR auth).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookies are read-only here.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    }
  );
}
