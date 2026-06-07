// IGDB proxy — holds the Twitch credentials server-side and serves two modes:
//   • "search"   (default): box art + metadata for a single title lookup.
//   • "upcoming"          : the next N months of releases for the Upcoming view.
// The browser never sees the token, and neither mode accepts a raw IGDB query —
// both are built server-side, so there's no query-injection surface.
//
// Secrets (supabase secrets set ...):
//   IGDB_CLIENT_ID, IGDB_CLIENT_SECRET
//
// IGDB auths via Twitch OAuth2 (client-credentials). We cache the app token in
// memory for the lifetime of the warm function instance.
import { cors, json } from "../_shared/cors.ts";

let cachedToken: { value: string; expires: number } | null = null;
// Upcoming releases change slowly; cache the built list per-window on the warm
// instance so repeated dashboard loads don't each hit IGDB.
let cachedUpcoming: { key: string; value: unknown; expires: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const id = Deno.env.get("IGDB_CLIENT_ID")!;
  const secret = Deno.env.get("IGDB_CLIENT_SECRET")!;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

const imgUrl = (id: string, size = "t_cover_big") =>
  id ? `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg` : "";

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// A single best-match lookup for the add/edit form's FILL.
async function search(headers: Record<string, string>, title: string) {
  const body = `
    search "${title.replace(/"/g, '\\"')}";
    fields name, summary, first_release_date, rating,
           cover.image_id, screenshots.image_id,
           genres.name,
           involved_companies.company.name,
           involved_companies.developer, involved_companies.publisher;
    limit 1;
  `;
  const res = await fetch("https://api.igdb.com/v4/games", { method: "POST", headers, body });
  const games = await res.json();
  const g = games?.[0];
  if (!g) return json({ match: null });

  const companies = g.involved_companies ?? [];
  const developer = companies.find((c: any) => c.developer)?.company?.name ?? "";
  const publisher = companies.find((c: any) => c.publisher)?.company?.name ?? "";

  return json({
    match: {
      igdbId: g.id,
      title: g.name,
      cover: g.cover?.image_id ? imgUrl(g.cover.image_id) : "",
      description: g.summary ?? "",
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
      rating: g.rating ? Math.round(g.rating) : null,
      genre: g.genres?.[0]?.name ?? "",
      developer,
      publisher,
      screenshots: (g.screenshots ?? []).slice(0, 4).map((s: any) => imgUrl(s.image_id, "t_screenshot_big")),
    },
  });
}

// One IGDB /games query. `ok` is false when IGDB returns an error shape (an
// object/array-of-errors) rather than a list of games, so callers can fall back.
async function igdbGames(headers: Record<string, string>, body: string): Promise<{ ok: boolean; data: any }> {
  const res = await fetch("https://api.igdb.com/v4/games", { method: "POST", headers, body });
  const data = await res.json().catch(() => null);
  return { ok: res.ok && Array.isArray(data), data };
}

// "Anticipated" upcoming releases over the next `months`: games followed on IGDB
// (hypes > 0), of a worthwhile type (main game 0 / remake 8 / remaster 9), one
// canonical edition (version_parent = null), with cover art — AND a confirmed
// day-level release date. IGDB stores vague dates ("Q2 2026", "2026") as
// quarter/year-end placeholders that otherwise pile up in a single month.
//
// Rather than depend on the release-date precision enum (renamed category→
// date_format in IGDB's 2025 migration, with ids we can't rely on), we read the
// stable `release_dates.human` string: full dates carry a day ("Jun 08, 2026"),
// while month/quarter/year placeholders ("Jun 2026", "Q2 2026", "2026") never do.
const UPCOMING_FIELDS =
  "fields name, hypes, game_type, cover.image_id, genres.name, platforms.abbreviation, platforms.name, release_dates.date, release_dates.human;";
// A day before the year (", 2026") only appears in full dates.
const DAY_EXACT = /\d{1,2},\s*\d{4}/;

async function upcoming(headers: Record<string, string>, months: number, limit: number, debug = false) {
  const now = Math.floor(Date.now() / 1000);
  const end = new Date();
  end.setMonth(end.getMonth() + months);
  const horizon = Math.floor(end.getTime() / 1000);
  // first_release_date is the earliest across platforms; >= now means unreleased.
  const where = `first_release_date >= ${now} & first_release_date <= ${horizon} & cover != null & hypes > 0`;
  // Most-followed first, so if the cap is ever reached we keep the headline titles.
  const tail = `sort hypes desc; limit ${limit};`;

  // Prefer type/edition filtering; fall back to just the window if IGDB rejects a
  // field, so the view still populates. Surface the raw error only if both fail.
  let { ok, data } = await igdbGames(headers, `${UPCOMING_FIELDS} where ${where} & version_parent = null & game_type = (0,8,9); ${tail}`);
  if (!ok) ({ ok, data } = await igdbGames(headers, `${UPCOMING_FIELDS} where ${where}; ${tail}`));
  if (!ok) return json({ games: [], error: data });

  const list = (data as any[])
    .map((g: any) => {
      // In-window release dates with a full "…, YYYY" day; earliest one wins.
      const dates = (g.release_dates ?? [])
        .filter((rd: any) => typeof rd.date === "number" && rd.date >= now && rd.date <= horizon && typeof rd.human === "string" && DAY_EXACT.test(rd.human))
        .map((rd: any) => rd.date as number);
      return {
        igdbId: g.id,
        title: g.name ?? "",
        cover: g.cover?.image_id ? imgUrl(g.cover.image_id) : "",
        releaseDate: dates.length ? Math.min(...dates) : null, // unix seconds
        platforms: (g.platforms ?? [])
          .map((p: any) => p.abbreviation || p.name)
          .filter((x: unknown): x is string => typeof x === "string" && x.length > 0),
        genre: g.genres?.[0]?.name ?? "",
        hype: g.hypes ?? 0,
      };
    })
    .filter((g) => g.title && g.releaseDate)
    // Calendar order: soonest first, most-anticipated breaking ties.
    .sort((a, b) => (a.releaseDate! - b.releaseDate!) || (b.hype - a.hype));

  // `debug` (direct calls only) surfaces what IGDB actually returned so we can
  // verify the date-precision logic without flying blind.
  if (debug) {
    return json({
      games: list,
      rawCount: (data as any[]).length,
      sample: (data as any[]).slice(0, 3).map((g: any) => ({ name: g.name, release_dates: g.release_dates })),
    });
  }
  return json({ games: list });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const payload = await req.json().catch(() => ({}));
    const mode = payload?.mode === "upcoming" ? "upcoming" : "search";

    const token = await getToken();
    const headers = {
      "Client-ID": Deno.env.get("IGDB_CLIENT_ID")!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    };

    if (mode === "upcoming") {
      const months = clampInt(payload?.months, 1, 12, 6);
      const limit = clampInt(payload?.limit, 1, 500, 500);
      const debug = payload?.debug === true;
      const key = `${months}:${limit}`;
      if (!debug && cachedUpcoming && cachedUpcoming.key === key && cachedUpcoming.expires > Date.now()) {
        return json(cachedUpcoming.value);
      }
      const res = await upcoming(headers, months, limit, debug);
      // Cache only a successful, non-empty result for 6h — never pin an error or
      // an empty list (which would survive a transient IGDB hiccup), and never a
      // debug payload.
      const value = await res.clone().json();
      if (!debug && Array.isArray(value?.games) && value.games.length > 0) {
        cachedUpcoming = { key, value, expires: Date.now() + 6 * 3600_000 };
      }
      return res;
    }

    const title = payload?.title;
    if (!title) return json({ error: "title required" }, 400);
    return await search(headers, title);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
