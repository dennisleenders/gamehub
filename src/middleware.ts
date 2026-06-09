import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Server Components can't write cookies, so this proxy refreshes the auth
// token on every request and writes it back to both the request and response.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // PWA assets must be publicly reachable — the OS fetches the manifest, icons and
  // splash images (and registers the service worker) without a session. Never
  // redirect these to /login. This is the authoritative guard; the matcher below
  // is just an optimization so the function usually doesn't even run for them.
  if (
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/icon" ||
    pathname === "/apple-icon" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/splash/")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: refreshes the session. Do not run other logic between
  // createServerClient and getClaims, per Supabase guidance.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Gate the app: unauthenticated users go to /login (except the login page itself).
  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon|apple-icon|icons|splash|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
