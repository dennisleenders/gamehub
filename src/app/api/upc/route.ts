import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Resolves a scanned barcode (UPC/EAN) to a product name via UPCitemdb's free
// trial endpoint — no API key, ~100 lookups/day. We only use it as a barcode→
// name dictionary (IGDB has no barcode field); the returned title seeds the Add
// form, where the user taps FILL to pull proper metadata. Called server-side
// because the trial endpoint blocks browser CORS.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { upc } = await req.json();
  if (!upc || !/^\d{6,14}$/.test(String(upc))) {
    return NextResponse.json({ error: "valid upc required" }, { status: 400 });
  }

  try {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(String(upc))}`, {
      headers: { Accept: "application/json" },
    });
    // 429 = daily/burst rate limit hit; surface it so the UI can hint at retry.
    if (r.status === 429) return NextResponse.json({ title: null, error: "rate_limited" });
    const data = await r.json();
    const title = data?.items?.[0]?.title ?? null;
    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: null });
  }
}
