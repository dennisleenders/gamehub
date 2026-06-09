import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Auth-gated proxy to the igdb-proxy Edge Function's "suggest" mode, powering the
// title field's typeahead. Runs server-side so the browser never holds the
// Supabase key and unauthenticated callers can't burn the shared IGDB quota.
// Returns at most a handful of lightweight candidates per query; not cached
// (results are per-keystroke). Short queries are answered locally with an empty
// list so a single character never reaches IGDB.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title } = await req.json().catch(() => ({ title: "" }));
  const q = typeof title === "string" ? title.trim() : "";
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const r = await fetch(`${base}/functions/v1/igdb-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ mode: "suggest", title: q }),
    });
    const data = await r.json();
    return NextResponse.json({ suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [] });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
