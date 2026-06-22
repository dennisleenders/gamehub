import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { priceByUpc, priceByQuery, toEurPrice, usdToEurRate, readPriceConfig } from "@/lib/pricecharting";

// Server-side aggregator: takes a title (and optionally the scanned UPC), fans out
// to the IGDB + HLTB Edge Functions and PriceCharting, and returns a single merged
// metadata object for the add/edit form. Runs server-side so the browser never
// holds any tokens.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, upc, withPrice, igdbId } = await req.json();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const call = async (fn: string, body: unknown) => {
    try {
      const r = await fetch(`${base}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      return await r.json();
    } catch {
      return null;
    }
  };

  // Pricing only runs when the client asks for it AND the feature is on with a
  // token set (read server-side, authoritative). When a scanned UPC is present we
  // match the exact edition; otherwise we fall back to a title-text search.
  const cfg = withPrice ? await readPriceConfig(supabase) : { enabled: false, token: "" };
  const doPrice = withPrice && cfg.enabled && !!cfg.token;
  const priceLookup = async () => {
    if (!doPrice) return null;
    const code = String(upc ?? "").replace(/\D/g, "");
    let m = code ? await priceByUpc(cfg.token, code) : null;
    if (!m) m = await priceByQuery(cfg.token, title);
    return m;
  };

  // Fetch the FX rate alongside the lookups (only when pricing) so it adds no
  // latency to the FILL.
  const [igdb, hltb, pcMatch, rate] = await Promise.all([
    call("igdb-proxy", { title, igdbId }),
    call("hltb-proxy", { title }),
    priceLookup(),
    doPrice ? usdToEurRate() : Promise.resolve(0),
  ]);

  // EUR-cent tiers; the form picks the tier matching the game's condition and
  // re-derives client-side when condition changes (no extra lookup).
  const priceOut = pcMatch ? toEurPrice(pcMatch, rate) : null;

  const m = igdb?.match ?? {};
  return NextResponse.json({
    title: m.title ?? title,
    cover: m.cover ?? "",
    description: m.description ?? "",
    developer: m.developer ?? "",
    publisher: m.publisher ?? "",
    year: m.year ?? null,
    release_ts: m.releaseTs ?? null,
    genre: m.genre ?? "",
    rating: m.rating ?? null,
    screenshots: m.screenshots ?? [],
    platforms: Array.isArray(m.platforms) ? m.platforms : [],
    igdb_id: m.igdbId ?? null,
    hltb: hltb?.match?.hltb ?? null,
    price: priceOut,
  });
}
