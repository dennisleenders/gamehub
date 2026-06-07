"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import type { UpcomingGame } from "@/lib/types";

// Release date (unix seconds) → "12 Jun". The month/year lives in the group
// header, so the per-card date stays compact.
const fmtDay = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// A game can list many platforms; keep the line short with a "+N" overflow.
const platformLine = (p: string[]) =>
  p.length <= 3 ? p.join(" · ") : `${p.slice(0, 3).join(" · ")} +${p.length - 3}`;

// Box art with a graceful first-letter fallback. IGDB nearly always has a cover
// (we filter for it server-side), so the fallback is rare.
export function UpcomingCover({ g, ratio = 1.32 }: { g: UpcomingGame; ratio?: number }) {
  const [err, setErr] = useState(false);
  const showArt = g.cover && !err;
  return (
    <div style={{ width: "100%", aspectRatio: `1 / ${ratio}`, borderRadius: "var(--radius)", position: "relative", overflow: "hidden", border: "1px solid var(--line)", background: "linear-gradient(150deg, var(--accent)33, var(--panel-alt))" }}>
      {showArt
        ? <img src={g.cover} alt={g.title} loading="lazy" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span style={{ fontFamily: "var(--display)", fontSize: 30, color: "var(--accent)", opacity: .5 }}>{(g.title || "?")[0]}</span></div>}
      <div style={{ position: "absolute", left: 7, bottom: 7, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 99, background: "#13111ad0", backdropFilter: "blur(6px)" }}>
        <CalendarClock size={11} color="var(--accent3)" />
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--display)", color: "#fff" }}>{fmtDay(g.releaseDate)}</span>
      </div>
    </div>
  );
}

// Horizontal slide rail for the dashboard — the soonest `count` releases. Mirrors
// the "Recently Added" shelf; the section header + SEE ALL live in VaultApp.
export function UpcomingRail({ games, loading, error, count = 10 }: { games: UpcomingGame[] | null; loading: boolean; error: boolean; count?: number }) {
  if (loading && !games) {
    return (
      <div style={{ display: "flex", gap: 14, overflowX: "hidden", paddingBottom: 8 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ flex: "0 0 auto", width: 122 }}>
            <div style={{ width: "100%", aspectRatio: "1 / 1.32", borderRadius: "var(--radius)", background: "var(--panel-alt)", border: "1px solid var(--line)" }} />
            <div style={{ height: 11, marginTop: 9, borderRadius: 6, background: "var(--panel-alt)", width: "85%" }} />
          </div>
        ))}
      </div>
    );
  }
  if (error || !games?.length) {
    return <div style={{ fontSize: 12.5, color: "var(--ink-dim)", padding: "4px 2px" }}>{error ? "Couldn't load upcoming releases." : "No upcoming releases found."}</div>;
  }
  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }} className="hide-scroll">
      {games.slice(0, count).map((g) => (
        <div key={g.igdbId} className="shelf-item" style={{ flex: "0 0 auto", width: 122, minWidth: 0, color: "var(--ink)", cursor: "default" }}>
          <UpcomingCover g={g} ratio={1.32} />
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, lineHeight: 1.2, height: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.title}</div>
          {g.platforms.length > 0 && <div style={{ fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{platformLine(g.platforms)}</div>}
        </div>
      ))}
    </div>
  );
}

function UpcomingCard({ g }: { g: UpcomingGame }) {
  return (
    <div className="upcoming-card" style={{ display: "flex", flexDirection: "column", gap: 9, color: "var(--ink)", minWidth: 0 }}>
      <UpcomingCover g={g} ratio={1.32} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2, height: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.title}</div>
        <div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.platforms.length ? platformLine(g.platforms) : (g.genre || "—")}</div>
      </div>
    </div>
  );
}

// Full Upcoming view — the next 6 months of releases, grouped by month.
export default function UpcomingView({ games, loading, error }: { games: UpcomingGame[] | null; loading: boolean; error: boolean }) {
  // Bucket by calendar month; the API already returns them soonest-first, so each
  // month's games stay in order and the month keys sort chronologically.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; games: UpcomingGame[] }>();
    for (const g of games ?? []) {
      const d = new Date(g.releaseDate * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase(), games: [] };
        map.set(key, bucket);
      }
      bucket.games.push(g);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
  }, [games]);

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 2 }}>
        <CalendarClock size={20} color="var(--accent3)" />
        <div>
          <div style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>UPCOMING</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 2 }}>Releases over the next 6 months</div>
        </div>
      </div>

      {loading && !games ? (
        <div style={{ display: "grid", placeItems: "center", padding: "70px 0", color: "var(--ink-dim)" }}><Loader2 size={24} className="spin" /></div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-dim)" }}>
          <CalendarClock size={38} style={{ opacity: .5 }} />
          <div style={{ marginTop: 12, fontFamily: "var(--display)" }}>COULDN&apos;T LOAD</div>
          <div style={{ fontSize: 12.5, marginTop: 6 }}>Pull to refresh, or try again later.</div>
        </div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-dim)" }}>
          <CalendarClock size={38} style={{ opacity: .5 }} />
          <div style={{ marginTop: 12, fontFamily: "var(--display)" }}>NOTHING UPCOMING</div>
          <div style={{ fontSize: 12.5, marginTop: 6 }}>No tracked releases in the next 6 months.</div>
        </div>
      ) : (
        groups.map((m) => (
          <section key={m.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--display)", fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>{m.label}</span>
              <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{m.games.length} {m.games.length === 1 ? "game" : "games"}</span>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>
            <div className="card-grid">
              {m.games.map((g) => <UpcomingCard key={g.igdbId} g={g} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
