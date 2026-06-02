import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Server-side aggregator: takes a title, fans out to the IGDB + HLTB (+ optional
// PriceCharting) Edge Functions, and returns a single merged metadata object for
// the add/edit form. Runs server-side so the browser never holds any tokens.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, withPrice } = await req.json();
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

  const [igdb, hltb, price] = await Promise.all([
    call("igdb-proxy", { title }),
    call("hltb-proxy", { title }),
    withPrice ? call("pricecharting-proxy", { q: title }) : Promise.resolve(null),
  ]);

  const m = igdb?.match ?? {};
  return NextResponse.json({
    title: m.title ?? title,
    cover: m.cover ?? "",
    description: m.description ?? "",
    developer: m.developer ?? "",
    publisher: m.publisher ?? "",
    year: m.year ?? null,
    genre: m.genre ?? "",
    rating: m.rating ?? null,
    screenshots: m.screenshots ?? [],
    igdb_id: m.igdbId ?? null,
    hltb: hltb?.match?.hltb ?? null,
    price: price?.match ?? null,
  });
}
