// HowLongToBeat proxy — HLTB has no official API, so this queries their search
// endpoint server-side and returns main / main+extra / completionist hours.
// Kept server-side to avoid CORS and to centralise any future rate-limiting.
//
// No secret required. Body: { title: "Nioh" }
import { cors, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { title } = await req.json();
    if (!title) return json({ error: "title required" }, 400);

    // HLTB's search POST endpoint. Shape changes occasionally; isolate it here
    // so only this function needs updating if their payload moves.
    const res = await fetch("https://howlongtobeat.com/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        Referer: "https://howlongtobeat.com",
        Origin: "https://howlongtobeat.com",
      },
      body: JSON.stringify({
        searchType: "games",
        searchTerms: title.split(" "),
        searchPage: 1,
        size: 1,
      }),
    });
    const data = await res.json();
    const g = data?.data?.[0];
    if (!g) return json({ match: null });

    // HLTB returns seconds; convert to whole hours.
    const h = (s: number) => (s ? Math.round(s / 3600) : null);
    return json({
      match: {
        title: g.game_name,
        hltb: {
          main: h(g.comp_main),
          extra: h(g.comp_plus),
          complete: h(g.comp_100),
        },
      },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
