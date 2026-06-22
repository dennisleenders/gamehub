import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UpcomingGame } from "@/lib/types";

// Auth-gated proxy to the igdb-proxy "event" mode: the games announced/featured
// at a single event, for the event detail modal. Games come back in the
// UpcomingGame shape so the client reuses its wishlist plumbing unchanged.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Math.floor(Number(id));
  // Non-positive ids (e.g. the temporary preview fixtures) have no IGDB games.
  if (!Number.isFinite(eventId) || eventId <= 0) return NextResponse.json({ games: [] });

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const r = await fetch(`${base}/functions/v1/igdb-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ mode: "event", id: eventId }),
    });
    const data = await r.json();
    return NextResponse.json(
      { games: Array.isArray(data?.games) ? (data.games as UpcomingGame[]) : [] },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return NextResponse.json({ games: [] });
  }
}
