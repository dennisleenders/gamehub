import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Resolves a scanned barcode (UPC/EAN) to a game name. We use two free sources,
// best-first, because IGDB itself has no barcode field:
//
//   1. levelcomplete.de — a video-game-specific barcode DB (~110k entries, EU/
//      PAL coverage, returns clean titles + the IGDB id). Primary source.
//   2. UPCitemdb trial  — a broad general-product DB (~100 lookups/day per IP).
//      Fallback for anything the game DB doesn't carry.
//
// Both run server-side (CORS is locked on both), so on a shared host like Vercel
// the UPCitemdb daily quota is shared across the server's IP. The resolved title
// seeds the Add form, where the user taps FILL for full metadata.

// Browser-style UA: levelcomplete.de's public endpoint 403s non-browser agents.
// It allows ~10 req/min — fine for scanning; see their integration note if usage
// grows: https://extremelysuccessfulapps.com/videogame-ean-database/
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;|&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// Primary: the game-specific DB. Returns the clean title, or null on miss/error.
// It's a hobby endpoint that can be slow/down, so we cap the wait and fall back
// fast rather than letting a scan hang. A miss returns a non-array error object,
// which the Array.isArray guard treats as "no result".
async function fromLevelComplete(code: string): Promise<string | null> {
  try {
    const r = await fetch(`https://levelcomplete.de/api/public/search.php?${code}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    const name = Array.isArray(data) && data[0]?.name ? String(data[0].name).trim() : "";
    return name ? decodeEntities(name) : null;
  } catch {
    return null;
  }
}

// Fallback: broad general-product DB. Distinguishes rate-limit vs invalid vs miss.
async function fromUpcItemDb(code: string): Promise<{ title: string | null; error?: string }> {
  try {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 429) return { title: null, error: "rate_limited" };
    const data = await r.json().catch(() => null);
    if (data?.code === "EXCEED_LIMIT" || data?.code === "TOO_FAST") return { title: null, error: "rate_limited" };
    if (data?.code === "INVALID_UPC") return { title: null, error: "invalid" };
    return { title: data?.items?.[0]?.title ?? null };
  } catch {
    return { title: null, error: "network" };
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { upc } = await req.json();
  const code = String(upc ?? "").replace(/\D/g, "");
  if (!/^\d{6,14}$/.test(code)) {
    return NextResponse.json({ title: null, error: "invalid" });
  }

  // Try the game-specific DB first; it has the cleanest, most relevant matches.
  const gameTitle = await fromLevelComplete(code);
  if (gameTitle) return NextResponse.json({ title: gameTitle, source: "levelcomplete" });

  // Fall back to the broad product DB; pass through its specific failure reason.
  const fallback = await fromUpcItemDb(code);
  return NextResponse.json({ ...fallback, source: fallback.title ? "upcitemdb" : undefined });
}
