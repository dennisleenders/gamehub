import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { priceByUpc, toEurPrice, usdToEurRate, readPriceConfig } from "@/lib/pricecharting";

// Resolves a scanned barcode (UPC/EAN) to a game name. Sources, best-first:
//
//   0. PriceCharting — ONLY when the paid feature is on with a token set. Its UPC
//      lookup is an exact-edition match and returns the price + product id in the
//      same call, so a scanned game is named AND priced in one shot.
//   1. levelcomplete.de — a video-game-specific barcode DB (~110k entries, EU/
//      PAL coverage, returns clean titles + the IGDB id). Free fallback.
//   2. UPCitemdb trial  — a broad general-product DB (~100 lookups/day per IP).
//      Free fallback for anything the game DB doesn't carry.
//
// The free sources run server-side (CORS is locked on both), so on a shared host
// like Vercel the UPCitemdb daily quota is shared across the server's IP. The
// resolved title (and any price) seeds the Add form, where the user taps FILL for
// the rest of the metadata.

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

// Fallback: broad general-product DB. Distinguishes the two throttles UPCitemdb
// applies — TOO_FAST is a short per-minute burst limit that clears in seconds,
// EXCEED_LIMIT is the ~100/day quota — plus invalid vs miss. The daily quota is
// IP-based and shared across the host, so on a serverless host like Vercel it can
// read as exhausted even when this app made few lookups. X-RateLimit-Reset is a
// Unix epoch (seconds) for when the daily window rolls over; we pass it through
// so the UI can tell the user when scanning resumes.
async function fromUpcItemDb(code: string): Promise<{ title: string | null; error?: string; resetAt?: number }> {
  try {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const resetAt = Number(r.headers.get("x-ratelimit-reset")) || undefined;
    const data = await r.json().catch(() => null);
    // Order matters: a TOO_FAST 429 carries that code in the body, so check it
    // before the bare-429 daily-cap fallback below.
    if (data?.code === "TOO_FAST") return { title: null, error: "too_fast", resetAt };
    if (data?.code === "EXCEED_LIMIT" || r.status === 429) return { title: null, error: "rate_limited", resetAt };
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

  // PriceCharting first when active: exact-edition name + price + id in one call.
  // We pass the price straight back so the form is pre-priced without a second
  // PriceCharting request at FILL time. A miss falls through to the free DBs.
  const cfg = await readPriceConfig(supabase);
  if (cfg.enabled && cfg.token) {
    const [m, rate] = await Promise.all([priceByUpc(cfg.token, code), usdToEurRate()]);
    if (m) {
      return NextResponse.json({
        title: m.name,
        source: "pricecharting",
        price: toEurPrice(m, rate),
        pricecharting_id: m.pricechartingId || null,
      });
    }
  }

  // Try the game-specific free DB next; it has the cleanest, most relevant matches.
  const gameTitle = await fromLevelComplete(code);
  if (gameTitle) return NextResponse.json({ title: gameTitle, source: "levelcomplete" });

  // Fall back to the broad product DB; pass through its specific failure reason.
  const fallback = await fromUpcItemDb(code);
  return NextResponse.json({ ...fallback, source: fallback.title ? "upcitemdb" : undefined });
}
