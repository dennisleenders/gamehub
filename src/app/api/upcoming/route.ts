import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Auth-gated proxy to the igdb-proxy Edge Function's "upcoming" mode. Runs
// server-side so the browser never holds the Supabase key, and so unauthenticated
// callers can't burn the shared IGDB quota. The list is identical for everyone;
// the Edge Function caches it for ~6h and we let the browser hold it briefly too.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const r = await fetch(`${base}/functions/v1/igdb-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ mode: "upcoming", months: 6 }),
    });
    const data = await r.json();
    return NextResponse.json(
      { games: Array.isArray(data?.games) ? data.games : [] },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return NextResponse.json({ games: [] });
  }
}
