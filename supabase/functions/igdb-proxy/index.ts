// IGDB proxy — holds the Twitch credentials server-side and returns box art +
// metadata for a title search. The browser never sees the token.
//
// Secrets (supabase secrets set ...):
//   IGDB_CLIENT_ID, IGDB_CLIENT_SECRET
//
// IGDB auths via Twitch OAuth2 (client-credentials). We cache the app token in
// memory for the lifetime of the warm function instance.
import { cors, json } from "../_shared/cors.ts";

let cachedToken: { value: string; expires: number } | null = null;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { title } = await req.json();
    if (!title) return json({ error: "title required" }, 400);

    const token = await getToken();
    const headers = {
      "Client-ID": Deno.env.get("IGDB_CLIENT_ID")!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    };

    // One IGDB query for the best match, expanding cover/companies/screenshots.
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
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
