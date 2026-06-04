// Server-side PriceCharting helpers, shared by the scan (/api/upc) and FILL
// (/api/metadata) routes. The token is read from app_settings server-side and
// never reaches the browser. PriceCharting quotes prices in USD pennies; we
// convert to EUR cents with a live ECB rate before returning to the client.
//
// All access goes through the household token here — the old pricecharting-proxy
// Edge Function (which held a PRICECHARTING_TOKEN secret) is no longer used.

// Frankfurter is a free, key-less feed of the ECB's daily reference rates; cached
// for half a day (they only refresh once per business day) with a static fallback
// so a price still lands if the feed is briefly unreachable.
const USD_EUR_FALLBACK = 0.92;
export async function usdToEurRate(): Promise<number> {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR", {
      next: { revalidate: 43200 },
    });
    const d = await r.json();
    return typeof d?.rates?.EUR === "number" && d.rates.EUR > 0 ? d.rates.EUR : USD_EUR_FALLBACK;
  } catch {
    return USD_EUR_FALLBACK;
  }
}

// A normalized PriceCharting product, prices still in USD cents.
export type PcMatch = {
  pricechartingId: string;
  name: string;
  consoleName: string;
  loose_cents: number | null;
  cib_cents: number | null;
  new_cents: number | null;
};

// Shape PriceCharting's raw product JSON into our match, or null if it isn't a
// real hit (a miss returns no product-name).
function normalize(p: any): PcMatch | null {
  if (!p || !p["product-name"]) return null;
  return {
    pricechartingId: String(p.id ?? ""),
    name: String(p["product-name"]),
    consoleName: p["console-name"] ?? "",
    loose_cents: typeof p["loose-price"] === "number" ? p["loose-price"] : null,
    cib_cents: typeof p["cib-price"] === "number" ? p["cib-price"] : null,
    new_cents: typeof p["new-price"] === "number" ? p["new-price"] : null,
  };
}

// Exact-edition lookup by scanned barcode. PriceCharting's /api/product accepts a
// `upc` param and returns the single matching product.
export async function priceByUpc(token: string, upc: string): Promise<PcMatch | null> {
  try {
    const r = await fetch(
      `https://www.pricecharting.com/api/product?t=${token}&upc=${encodeURIComponent(upc)}`,
    );
    return normalize(await r.json());
  } catch {
    return null;
  }
}

// Best-effort lookup by title text. /api/product?q= returns the single best match
// directly (one call). Less precise than UPC — it can land on another region or
// edition — so it's used for manually typed titles or when a UPC lookup misses.
export async function priceByQuery(token: string, q: string): Promise<PcMatch | null> {
  try {
    const r = await fetch(
      `https://www.pricecharting.com/api/product?t=${token}&q=${encodeURIComponent(q)}`,
    );
    return normalize(await r.json());
  } catch {
    return null;
  }
}

// Convert a match's USD-cent tiers to the EUR-cent payload the client consumes.
export function toEurPrice(m: PcMatch, rate: number) {
  const toEur = (c: number | null) => (typeof c === "number" ? Math.round(c * rate) : null);
  return {
    pricecharting_id: m.pricechartingId || null,
    name: m.name,
    loose_cents: toEur(m.loose_cents),
    cib_cents: toEur(m.cib_cents),
    new_cents: toEur(m.new_cents),
  };
}

// Read the shared PriceCharting feature flag + token in a single query. The token
// stays server-side; callers gate their lookups on `enabled && token`.
export async function readPriceConfig(
  supabase: { from: (t: string) => any },
): Promise<{ enabled: boolean; token: string }> {
  const { data } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", ["pricecharting_enabled", "pricecharting_token"]);
  const byKey: Record<string, any> = {};
  (data ?? []).forEach((r: any) => { byKey[r.key] = r.value; });
  return {
    enabled: byKey.pricecharting_enabled === true,
    token: typeof byKey.pricecharting_token === "string" ? byKey.pricecharting_token.trim() : "",
  };
}
