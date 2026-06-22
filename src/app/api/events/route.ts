import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GameEvent } from "@/lib/types";

// TEMP — preview fixture so the Events rail/view can be exercised before the
// igdb-proxy "events" mode is deployed. One live now.
// Remove this block (and the spread in the response) once real events flow in.
function tempEvents(): GameEvent[] {
  const now = Math.floor(Date.now() / 1000);
  const HOUR = 3600;
  return [
    {
      id: -1,
      name: "Test Live Showcase",
      description: "Temporary fixture — a live event to preview the LIVE state.",
      startTime: now - HOUR,        // started an hour ago
      endTime: now + 2 * HOUR,      // ends in two hours → currently live
      liveStreamUrl: "https://www.twitch.tv/",
      logo: "",
    },
  ];
}

// Auth-gated proxy to the igdb-proxy Edge Function's "events" mode. Mirrors
// /api/upcoming: runs server-side so the browser never holds the Supabase key,
// and unauthenticated callers can't burn the shared IGDB quota. The list is
// identical for everyone; the Edge Function caches it for ~6h and we let the
// browser hold it briefly too.
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
      body: JSON.stringify({ mode: "events" }),
    });
    const data = await r.json();
    const real = Array.isArray(data?.events) ? (data.events as GameEvent[]) : [];
    return NextResponse.json(
      { events: [...tempEvents(), ...real] }, // TEMP: drop tempEvents() once real events flow in
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return NextResponse.json({ events: tempEvents() }); // TEMP: revert to { events: [] }
  }
}
