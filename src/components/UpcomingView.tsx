"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Loader2, Heart, ChevronDown, Grid2x2, LayoutGrid, List, X } from "lucide-react";
import type { UpcomingGame } from "@/lib/types";

// Display modes for the Upcoming view: two grid densities + a list. For the grids,
// `col` drives an auto-fill template so the column count follows the viewport
// width; `col`/`gap` are unused by the list mode (rendered as stacked rows).
const LAYOUTS = [
  { key: "comfortable", Icon: Grid2x2, col: "minmax(160px, 1fr)", gap: "18px 14px" },
  { key: "standard", Icon: LayoutGrid, col: "minmax(110px, 1fr)", gap: "16px 12px" },
  { key: "list", Icon: List, col: "", gap: "" },
] as const;
type LayoutKey = (typeof LAYOUTS)[number]["key"];

// Release date (unix seconds) → "12 Jun". The month/year lives in the group
// header, so the per-card date stays compact.
const fmtDay = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// A game can list many platforms; keep the line short with a "+N" overflow.
const platformLine = (p: string[]) =>
  p.length <= 3 ? p.join(" · ") : `${p.slice(0, 3).join(" · ")} +${p.length - 3}`;

// Box art with a graceful first-letter fallback. IGDB nearly always has a cover
// (we filter for it server-side), so the fallback is rare.
export function UpcomingCover({ g, ratio = 1.32, wishlisted = false }: { g: UpcomingGame; ratio?: number; wishlisted?: boolean }) {
  const [err, setErr] = useState(false);
  const showArt = g.cover && !err;
  return (
    <div style={{ width: "100%", aspectRatio: `1 / ${ratio}`, borderRadius: "var(--radius)", position: "relative", overflow: "hidden", border: "1px solid var(--line)", background: "linear-gradient(150deg, var(--accent)33, var(--panel-alt))" }}>
      {showArt
        ? <img src={g.cover} alt={g.title} loading="lazy" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span style={{ fontFamily: "var(--display)", fontSize: 30, color: "var(--accent)", opacity: .5 }}>{(g.title || "?")[0]}</span></div>}
      {wishlisted && (
        <div style={{ position: "absolute", top: 7, right: 7, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 99, background: "#13111ad0", backdropFilter: "blur(6px)" }}>
          <Heart size={12} color="var(--accent)" fill="var(--accent)" />
        </div>
      )}
      <div style={{ position: "absolute", left: 7, bottom: 7, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 99, background: "#13111ad0", backdropFilter: "blur(6px)" }}>
        <CalendarClock size={11} color="var(--accent3)" />
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--display)", color: "#fff" }}>{fmtDay(g.releaseDate)}</span>
      </div>
    </div>
  );
}

// Horizontal slide rail for the dashboard — the soonest `count` releases. Mirrors
// the "Recently Added" shelf; the section header + SEE ALL live in VaultApp.
export function UpcomingRail({ games, loading, error, count = 10, wishlistIds, onOpen }: { games: UpcomingGame[] | null; loading: boolean; error: boolean; count?: number; wishlistIds?: Set<number>; onOpen?: (g: UpcomingGame) => void }) {
  if (loading && !games) {
    return (
      <div style={{ display: "flex", gap: 14, overflowX: "hidden", paddingBottom: 8 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ flex: "0 0 auto", width: 122 }}>
            <div className="skeleton" style={{ width: "100%", aspectRatio: "1 / 1.32", borderRadius: "var(--radius)", border: "1px solid var(--line)" }} />
            <div className="skeleton" style={{ height: 11, marginTop: 9, borderRadius: 6, width: "85%" }} />
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
        <button key={g.igdbId} onClick={() => onOpen?.(g)} className="shelf-item" style={{ flex: "0 0 auto", width: 122, minWidth: 0, color: "var(--ink)", background: "none", border: "none", padding: 0, textAlign: "left", font: "inherit", cursor: onOpen ? "pointer" : "default" }}>
          <UpcomingCover g={g} ratio={1.32} wishlisted={wishlistIds?.has(g.igdbId)} />
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, lineHeight: 1.2, height: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.title}</div>
          {g.platforms.length > 0 && <div style={{ fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{platformLine(g.platforms)}</div>}
        </button>
      ))}
    </div>
  );
}

function UpcomingCard({ g, wishlisted, onClick }: { g: UpcomingGame; wishlisted?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="upcoming-card game-card" style={{ display: "flex", flexDirection: "column", gap: 9, color: "var(--ink)", minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", font: "inherit", cursor: onClick ? "pointer" : "default" }}>
      <UpcomingCover g={g} ratio={1.32} wishlisted={wishlisted} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2, height: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.title}</div>
        <div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.platforms.length ? platformLine(g.platforms) : (g.genre || "—")}</div>
      </div>
    </button>
  );
}

// List-mode row: compact box-art thumbnail, then title + platforms, with the
// release day trailing on the right. Mirrors the card's data, laid out wide.
function UpcomingRow({ g, wishlisted, onClick }: { g: UpcomingGame; wishlisted?: boolean; onClick?: () => void }) {
  const [err, setErr] = useState(false);
  const showArt = g.cover && !err;
  return (
    <button onClick={onClick} className="upcoming-row game-card" style={{ display: "flex", alignItems: "center", gap: 13, padding: "9px 12px", borderRadius: "var(--radius)", background: "var(--panel)", border: "1px solid var(--line)", minWidth: 0, width: "100%", textAlign: "left", font: "inherit", color: "var(--ink)", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ flex: "0 0 auto", width: 46, aspectRatio: "1 / 1.32", borderRadius: 7, overflow: "hidden", position: "relative", border: "1px solid var(--line)", background: "linear-gradient(150deg, var(--accent)33, var(--panel-alt))" }}>
        {showArt
          ? <img src={g.cover} alt={g.title} loading="lazy" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span style={{ fontFamily: "var(--display)", fontSize: 18, color: "var(--accent)", opacity: .5 }}>{(g.title || "?")[0]}</span></div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</span>
          {wishlisted && <Heart size={12} color="var(--accent)" fill="var(--accent)" style={{ flexShrink: 0 }} />}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.platforms.length ? platformLine(g.platforms) : (g.genre || "—")}</div>
      </div>
      <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
        <CalendarClock size={12} color="var(--accent3)" />
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--display)" }}>{fmtDay(g.releaseDate)}</span>
      </div>
    </button>
  );
}

// Full Upcoming view — the next 6 months of releases, grouped by month. Supports
// filtering by system and wishlist status, plus two grid densities and a list view.
export default function UpcomingView({ games, loading, error, wishlistIds, onOpen }: { games: UpcomingGame[] | null; loading: boolean; error: boolean; wishlistIds?: Set<number>; onOpen?: (g: UpcomingGame) => void }) {
  const [system, setSystem] = useState("all");
  const [wish, setWish] = useState("all");
  const [layout, setLayout] = useState<LayoutKey>("comfortable");

  const isWished = (g: UpcomingGame) => !!wishlistIds?.has(g.igdbId);

  // Distinct systems across every release, for the dropdown. Built from the full
  // list (not the filtered one) so the option set doesn't shrink as you filter.
  const systems = useMemo(() => {
    const set = new Set<string>();
    for (const g of games ?? []) for (const p of g.platforms) set.add(p);
    return [...set].sort();
  }, [games]);

  const filtered = useMemo(() => (games ?? []).filter((g) => {
    if (system !== "all" && !g.platforms.includes(system)) return false;
    if (wish === "yes" && !isWished(g)) return false;
    if (wish === "no" && isWished(g)) return false;
    return true;
  }), [games, system, wish, wishlistIds]);

  // Bucket by calendar month; the API already returns them soonest-first, so each
  // month's games stay in order and the month keys sort chronologically.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; games: UpcomingGame[] }>();
    for (const g of filtered) {
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
  }, [filtered]);

  const cfg = LAYOUTS.find((l) => l.key === layout)!;
  const isList = layout === "list";
  const hasFilter = system !== "all" || wish !== "all";
  const hasGames = !!games?.length;

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 2 }}>
        <CalendarClock size={20} color="var(--accent3)" />
        <div>
          <div style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>UPCOMING</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 2 }}>Releases over the next 6 months</div>
        </div>
      </div>

      {hasGames && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: -10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
            <div style={{ flex: "1 1 150px", minWidth: 0 }}>
              <Filter label="SYSTEM" value={system} onChange={setSystem}
                options={[["all", "All systems"], ...systems.map((p) => [p, p] as [string, string])]} />
            </div>
            <div style={{ flex: "1 1 150px", minWidth: 0 }}>
              <Filter label="WISHLIST" value={wish} onChange={setWish}
                options={[["all", "All games"], ["yes", "On wishlist"], ["no", "Not wishlisted"]]} />
            </div>
            <div style={{ display: "flex", gap: 4, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 4 }}>
              {LAYOUTS.map(({ key, Icon }) => (
                <button key={key} onClick={() => setLayout(key)} aria-label={key === "list" ? "List view" : `${key} grid`} aria-pressed={layout === key}
                  className="layout-btn" style={{ background: layout === key ? "var(--accent2)" : "transparent", color: layout === key ? "var(--bg)" : "var(--ink-dim)" }}>
                  <Icon size={17} />
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 2 }}>
            <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{filtered.length} {filtered.length === 1 ? "game" : "games"}</span>
            {hasFilter && (
              <button onClick={() => { setSystem("all"); setWish("all"); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--accent2)", fontFamily: "var(--display)", fontSize: 11, fontWeight: 700 }}>
                <X size={12} /> RESET
              </button>
            )}
          </div>
        </div>
      )}

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
          <div style={{ marginTop: 12, fontFamily: "var(--display)" }}>{hasFilter ? "NO MATCHES" : "NOTHING UPCOMING"}</div>
          <div style={{ fontSize: 12.5, marginTop: 6 }}>{hasFilter ? "No releases match these filters." : "No tracked releases in the next 6 months."}</div>
        </div>
      ) : (
        groups.map((m) => (
          <section key={m.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--display)", fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>{m.label}</span>
              <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{m.games.length} {m.games.length === 1 ? "game" : "games"}</span>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>
            {isList ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {m.games.map((g) => <UpcomingRow key={g.igdbId} g={g} wishlisted={isWished(g)} onClick={() => onOpen?.(g)} />)}
              </div>
            ) : (
              <div className="card-grid" style={{ gridTemplateColumns: `repeat(auto-fill, ${cfg.col})`, gap: cfg.gap }}>
                {m.games.map((g) => <UpcomingCard key={g.igdbId} g={g} wishlisted={isWished(g)} onClick={() => onOpen?.(g)} />)}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

// Compact select styled to match the collection's FilterField, kept local so this
// view stays self-contained (no circular import back into VaultApp).
function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const current = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <label style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", minWidth: 0 }}>
      <span style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, paddingLeft: 2 }}>{label}</span>
      <div style={{ position: "relative", display: "flex", alignItems: "center", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "10px 30px 10px 13px" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current}</span>
        <ChevronDown size={15} color="var(--ink-dim)" style={{ position: "absolute", right: 10, pointerEvents: "none" }} />
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", border: "none", appearance: "none" }}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </label>
  );
}
