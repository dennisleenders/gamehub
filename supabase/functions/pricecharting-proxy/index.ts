// PriceCharting proxy — holds the private 40-char token server-side.
// Returns loose / CIB / new prices (in cents) for a product.
//
// Secret: PRICECHARTING_TOKEN
//
// Body: { q: "metal gear solid ps1" }  (free-text product search)
//   or  { id: "6910" }                 (known PriceCharting product id)
import { cors, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = Deno.env.get("PRICECHARTING_TOKEN")!;
    const { q, id } = await req.json();

    // Resolve a product id from a text query if needed.
    let productId = id;
    if (!productId && q) {
      const sr = await fetch(
        `https://www.pricecharting.com/api/products?t=${token}&q=${encodeURIComponent(q)}`
      );
      const sd = await sr.json();
      productId = sd?.products?.[0]?.id;
    }
    if (!productId) return json({ match: null });

    const pr = await fetch(`https://www.pricecharting.com/api/product?t=${token}&id=${productId}`);
    const p = await pr.json();

    // PriceCharting returns prices as integer pennies (USD).
    return json({
      match: {
        pricechartingId: String(productId),
        name: p["product-name"] ?? "",
        loose_cents: p["loose-price"] ?? null,
        cib_cents: p["cib-price"] ?? null,
        new_cents: p["new-price"] ?? null,
        synced_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
