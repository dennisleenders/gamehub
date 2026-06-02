// HowLongToBeat proxy — HLTB has no official API, so this queries their search
// endpoint server-side and returns main / main+extra / completionist hours.
// Kept server-side to avoid CORS and to centralise the (frequently-changing)
// request flow described below.
//
// HLTB's search is anti-bot protected and the endpoint is renamed every few
// months (was /api/search, then /api/seek, now /api/<word>). The current name
// is only discoverable from their frontend JS bundle, so we:
//   1. discover the endpoint word by scraping the homepage's JS chunks for
//      `/api/<word>/init` (cached module-side; falls back to a known default),
//   2. GET /api/<word>/init?t=<ts> for a per-session { token, hpKey, hpVal }
//      security handshake (the token is bound to this server's IP + User-Agent,
//      so init and search must share both),
//   3. POST /api/<word> with those values in headers AND body.
// On a 403 (expired token) or 404 (endpoint renamed) we re-discover once and retry.
//
// No secret required. Body: { title: "Nioh" }
import { cors, json } from "../_shared/cors.ts";

const HLTB = "https://howlongtobeat.com";
// Must be consistent between init and search — the token is fingerprinted to it.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const baseHeaders = { "User-Agent": UA, Referer: `${HLTB}/`, Origin: HLTB };

// Cached endpoint word (e.g. "bleed"). Persists while the isolate stays warm.
let endpoint = "bleed";

// Scrape the homepage's JS chunks for the current `/api/<word>/init` route.
async function discoverEndpoint(): Promise<string> {
  const home = await (await fetch(`${HLTB}/`, { headers: baseHeaders })).text();
  const chunks = [...home.matchAll(/\/_next\/static\/chunks\/[\w./-]+\.js/g)]
    .map((m) => m[0]);
  for (const path of chunks) {
    const js = await (await fetch(`${HLTB}${path}`, { headers: baseHeaders })).text();
    const m = js.match(/\/api\/([a-z]+)\/init/);
    if (m) return m[1];
  }
  return endpoint; // keep the last-known word if discovery turns up nothing
}

async function search(title: string) {
  // 1. security handshake
  const init = await fetch(`${HLTB}/api/${endpoint}/init?t=${Date.now()}`, {
    headers: baseHeaders,
  });
  if (!init.ok) return init.status; // 404 => endpoint renamed; signal caller to re-discover
  const { token, hpKey, hpVal } = await init.json();

  // 2. search request — hpKey/hpVal go in BOTH headers and body
  const body: Record<string, unknown> = {
    searchType: "games",
    searchTerms: title.trim().split(" "),
    searchPage: 1,
    size: 5,
    searchOptions: {
      games: {
        userId: 0, platform: "", sortCategory: "popular", rangeCategory: "main",
        rangeTime: { min: null, max: null },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { min: "", max: "" }, modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "", sort: 0, randomizer: 0,
    },
    useCache: true,
  };
  body[hpKey] = hpVal;

  const res = await fetch(`${HLTB}/api/${endpoint}`, {
    method: "POST",
    headers: {
      ...baseHeaders,
      "Content-Type": "application/json",
      "x-auth-token": token,
      "x-hp-key": hpKey,
      "x-hp-val": hpVal,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 403) return 403; // token expired/invalid fingerprint => retry
  if (!res.ok) return res.status;
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { title } = await req.json();
    if (!title) return json({ error: "title required" }, 400);

    // First attempt; on a 403/404 re-discover the endpoint and retry once.
    let data = await search(title);
    if (typeof data === "number" && (data === 403 || data === 404)) {
      endpoint = await discoverEndpoint();
      data = await search(title);
    }
    if (typeof data === "number") {
      return json({ error: `hltb upstream ${data}` }, 502);
    }

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
