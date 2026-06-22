"use client";

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { CalendarClock, Loader2, Heart, ChevronDown, ChevronRight, ChevronLeft, Grid2x2, LayoutGrid, List, X, SlidersHorizontal, Gamepad2, Radio, ExternalLink } from "lucide-react";
import type { UpcomingGame, GameEvent } from "@/lib/types";
import { useLazyList } from "@/lib/useLazyList";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

// Display modes for the Upcoming view: two grid densities + a list. For the grids,
// `col` drives an auto-fill template so the column count follows the viewport
// width; `col`/`gap` are unused by the list mode (rendered as stacked rows).
const LAYOUTS = [
  { key: "comfortable", Icon: Grid2x2, col: "minmax(160px, 1fr)", gap: "18px 14px" },
  { key: "standard", Icon: LayoutGrid, col: "minmax(100px, 1fr)", gap: "16px 12px" },
  { key: "list", Icon: List, col: "", gap: "" },
] as const;
type LayoutKey = (typeof LAYOUTS)[number]["key"];

// Multiplayer filters. The player-count filter matches games whose max player
// count is at least the chosen threshold; the type filter (shown only once a
// count is picked) narrows to a specific kind of multiplayer.
const PLAYER_OPTIONS: [string, string][] = [["all", "Any"], ["2", "2+ players"], ["3", "3+ players"], ["4", "4+ players"], ["8", "8+ players"], ["16", "16+ players"]];
const MP_TYPE_OPTIONS: [string, string][] = [["all", "Any type"], ["online", "Online"], ["couch", "Couch co-op"], ["split", "Split-screen"], ["lan", "LAN"]];

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

// Dashboard hint rail — what's live now + the next few showcases, soonest-first.
// Mirrors the UpcomingRail shape; the section header + SEE ALL live in VaultApp.
// A near-horizon "coming soon" hint: live now + everything starting within the
// next two weeks. The full Events view is where the longer horizon + passed
// events live, so the rail intentionally stays short.
const RAIL_WINDOW_DAYS = 14;
export function EventsRail({ events, loading, error, onOpen }: { events: GameEvent[] | null; loading: boolean; error: boolean; onOpen?: () => void }) {
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const rail = useMemo(() => {
    const horizon = now + RAIL_WINDOW_DAYS * 86400;
    const isLive = (e: GameEvent) => (e.startTime ?? 0) <= now && now <= (e.endTime ?? (e.startTime ?? 0) + 6 * 3600);
    return (events ?? [])
      .filter((e) => e.startTime && (isLive(e) || (e.startTime! > now && e.startTime! <= horizon)))
      // Live first, then soonest upcoming.
      .sort((a, b) => (Number(isLive(b)) - Number(isLive(a))) || (a.startTime! - b.startTime!))
      .map((e) => ({ e, live: isLive(e) }));
  }, [events, now]);

  if (loading && !events) {
    return (
      <div style={{ display: "flex", gap: 14, overflowX: "hidden", paddingBottom: 8 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} style={{ flex: "0 0 auto", width: 190 }}>
            <div className="skeleton" style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: "var(--radius)", border: "1px solid var(--line)" }} />
            <div className="skeleton" style={{ height: 11, marginTop: 9, borderRadius: 6, width: "85%" }} />
          </div>
        ))}
      </div>
    );
  }
  if (error || !rail.length) {
    return <div style={{ fontSize: 12.5, color: "var(--ink-dim)", padding: "4px 2px" }}>{error ? "Couldn't load events." : "No events in the next two weeks."}</div>;
  }
  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }} className="hide-scroll">
      {rail.map(({ e, live }) => {
        const dateLine = live ? "Live now" : relTime(e.startTime!, now);
        return (
          <button key={e.id} onClick={onOpen} className="shelf-item" style={{ flex: "0 0 auto", width: 190, minWidth: 0, color: "var(--ink)", background: "none", border: "none", padding: 0, textAlign: "left", font: "inherit", cursor: onOpen ? "pointer" : "default" }}>
            <EventLogo e={e} live={live} />
            <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
            <div style={{ fontSize: 10.5, color: live ? "var(--accent)" : "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginTop: 3 }}>{dateLine}</div>
          </button>
        );
      })}
    </div>
  );
}

// Landscape event logo with a graceful icon fallback + an optional LIVE badge.
function EventLogo({ e, live }: { e: GameEvent; live: boolean }) {
  const [err, setErr] = useState(false);
  const showLogo = e.logo && !err;
  return (
    <div style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: "var(--radius)", position: "relative", overflow: "hidden", border: "1px solid var(--line)", background: "linear-gradient(150deg, var(--accent)33, var(--panel-alt))", display: "grid", placeItems: "center" }}>
      {showLogo
        ? <img src={e.logo} alt={e.name} loading="lazy" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <Radio size={26} color="var(--accent)" style={{ opacity: .5 }} />}
      {live && (
        <div style={{ position: "absolute", top: 7, left: 7, display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 99, background: "var(--accent)", color: "var(--bg)", fontSize: 9.5, fontWeight: 800, fontFamily: "var(--display)", letterSpacing: 0.5 }}>
          <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--bg)" }} /> LIVE
        </div>
      )}
    </div>
  );
}

// Builds the heart's toggle: add when off, remove when on. Undefined for owned
// games (can't wishlist something already in the collection) so the heart hides.
function wishlistToggle(g: UpcomingGame, owned?: boolean, onWishlist?: (g: UpcomingGame) => Promise<void> | void, onUnwishlist?: (g: UpcomingGame) => Promise<void> | void) {
  if (owned) return undefined;
  return (next: boolean) => (next ? onWishlist?.(g) : onUnwishlist?.(g));
}

function UpcomingCard({ g, wishlisted, owned, onWishlist, onUnwishlist, onClick }: { g: UpcomingGame; wishlisted?: boolean; owned?: boolean; onWishlist?: (g: UpcomingGame) => Promise<void> | void; onUnwishlist?: (g: UpcomingGame) => Promise<void> | void; onClick?: () => void }) {
  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <button onClick={onClick} className="upcoming-card game-card" style={{ display: "flex", flexDirection: "column", gap: 9, color: "var(--ink)", minWidth: 0, width: "100%", background: "none", border: "none", padding: 0, textAlign: "left", font: "inherit", cursor: onClick ? "pointer" : "default" }}>
        <UpcomingCover g={g} ratio={1.32} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2, height: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.title}</div>
          <div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.platforms.length ? platformLine(g.platforms) : (g.genre || "—")}</div>
        </div>
      </button>
      <WishlistButton wishlisted={!!wishlisted} onToggle={wishlistToggle(g, owned, onWishlist, onUnwishlist)} />
    </div>
  );
}

// Rounded heart pinned to a card/row's top corner: tap to add to the wishlist,
// tap again to remove. The fill flips instantly (optimistic — no spinner) and the
// write happens in the background; the prop reconciles it once the reload lands,
// and a failed write reverts the fill. Hidden entirely when there's no action
// (e.g. the game is already owned) and it isn't wishlisted.
function WishlistButton({ wishlisted, onToggle, style }: { wishlisted: boolean; onToggle?: (next: boolean) => Promise<void> | void; style?: CSSProperties }) {
  // `optimistic` overrides the fill only while a write is in flight; clearing it
  // afterward hands control back to the reloaded prop (and reverts on failure).
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const on = optimistic ?? wishlisted;
  if (!onToggle) return null; // no action available (e.g. already owned)
  const base: CSSProperties = { position: "absolute", top: 7, right: 7, zIndex: 2, display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 99, background: "#13111ad0", backdropFilter: "blur(6px)", border: "none", padding: 0, cursor: "pointer", ...style };
  const click = (e: MouseEvent) => {
    e.stopPropagation();
    const next = !on;
    setOptimistic(next);
    Promise.resolve(onToggle(next)).finally(() => setOptimistic(null));
  };
  return (
    <button onClick={click} aria-label={on ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={on} style={base}>
      <Heart size={14} color={on ? "var(--accent)" : "#fff"} fill={on ? "var(--accent)" : "none"} />
    </button>
  );
}

// List-mode row: compact box-art thumbnail, then title + platforms, with the
// release day trailing on the right. Mirrors the card's data, laid out wide.
function UpcomingRow({ g, wishlisted, owned, onWishlist, onUnwishlist, onClick }: { g: UpcomingGame; wishlisted?: boolean; owned?: boolean; onWishlist?: (g: UpcomingGame) => Promise<void> | void; onUnwishlist?: (g: UpcomingGame) => Promise<void> | void; onClick?: () => void }) {
  const [err, setErr] = useState(false);
  const showArt = g.cover && !err;
  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <button onClick={onClick} className="upcoming-row game-card" style={{ display: "flex", alignItems: "center", gap: 13, padding: "9px 48px 9px 12px", borderRadius: "var(--radius)", background: "var(--panel)", border: "1px solid var(--line)", minWidth: 0, width: "100%", textAlign: "left", font: "inherit", color: "var(--ink)", cursor: onClick ? "pointer" : "default" }}>
        <div style={{ flex: "0 0 auto", width: 46, aspectRatio: "1 / 1.32", borderRadius: 7, overflow: "hidden", position: "relative", border: "1px solid var(--line)", background: "linear-gradient(150deg, var(--accent)33, var(--panel-alt))" }}>
          {showArt
            ? <img src={g.cover} alt={g.title} loading="lazy" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span style={{ fontFamily: "var(--display)", fontSize: 18, color: "var(--accent)", opacity: .5 }}>{(g.title || "?")[0]}</span></div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</div>
          <div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.platforms.length ? platformLine(g.platforms) : (g.genre || "—")}</div>
        </div>
        <div style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <CalendarClock size={12} color="var(--accent3)" />
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--display)" }}>{fmtDay(g.releaseDate)}</span>
        </div>
      </button>
      <WishlistButton wishlisted={!!wishlisted} onToggle={wishlistToggle(g, owned, onWishlist, onUnwishlist)} style={{ top: "50%", right: 10, transform: "translateY(-50%)" }} />
    </div>
  );
}

// Full Upcoming view — two sections behind a Games/Events toggle. "Games" is the
// next 6 months of releases grouped by month (filterable by system/wishlist/
// players, with two grid densities + a list view); "Events" is IGDB's industry
// showcases split into upcoming / live now / passed.
export default function UpcomingView({ games, loading, error, events, eventsLoading, eventsError, initialMode = "games", wishlistIds, ownedIds, onWishlist, onUnwishlist, onOpen, onOpenEvent }: { games: UpcomingGame[] | null; loading: boolean; error: boolean; events?: GameEvent[] | null; eventsLoading?: boolean; eventsError?: boolean; initialMode?: "games" | "events"; wishlistIds?: Set<number>; ownedIds?: Set<number>; onWishlist?: (g: UpcomingGame) => Promise<void> | void; onUnwishlist?: (g: UpcomingGame) => Promise<void> | void; onOpen?: (g: UpcomingGame) => void; onOpenEvent?: (e: GameEvent) => void }) {
  const [mode, setMode] = useState<"games" | "events">(initialMode);
  const [system, setSystem] = useState("all");
  const [wish, setWish] = useState("all");
  const [players, setPlayers] = useState("all");
  const [mpType, setMpType] = useState("all");
  const [layout, setLayout] = useState<LayoutKey>("comfortable");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Picking "Any" players also clears the type filter (which is only shown while a
  // player count is selected) so a stale type doesn't apply when re-enabled.
  const onPlayers = (v: string) => { setPlayers(v); if (v === "all") setMpType("all"); };

  const isWished = (g: UpcomingGame) => !!wishlistIds?.has(g.igdbId);
  const isOwned = (g: UpcomingGame) => !!ownedIds?.has(g.igdbId);

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
    if (players !== "all" && g.maxPlayers < Number(players)) return false;
    if (players !== "all" && mpType !== "all" && !g.mpTypes.includes(mpType)) return false;
    return true;
  }), [games, system, wish, players, mpType, wishlistIds]);

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

  // Reveal releases in pages so a long list paints fast. The budget is spread
  // across the month groups in order, dropping trailing groups once spent.
  const { count: shownCount, sentinel } = useLazyList(filtered.length, `${system} ${wish} ${players} ${mpType}`);
  const visibleGroups = useMemo(() => {
    let budget = shownCount;
    const out: { label: string; total: number; games: UpcomingGame[] }[] = [];
    for (const m of groups) {
      if (budget <= 0) break;
      const slice = m.games.slice(0, budget);
      budget -= slice.length;
      out.push({ label: m.label, total: m.games.length, games: slice });
    }
    return out;
  }, [groups, shownCount]);

  const cfg = LAYOUTS.find((l) => l.key === layout)!;
  const isList = layout === "list";
  const hasFilter = system !== "all" || wish !== "all" || players !== "all" || mpType !== "all";
  const activeFilters = [system, wish, players, mpType].filter((v) => v !== "all").length;
  const hasGames = !!games?.length;

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Filters live in a collapsible dropdown (mirrors the collection view) +
            the grid/list toggle — games mode only, since events have no filters. */}
        {mode === "games" && hasGames && (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "11px 14px", cursor: "pointer", color: "var(--ink)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <SlidersHorizontal size={16} color="var(--ink-dim)" /> Filters
                  {activeFilters > 0 && <span style={{ display: "grid", placeItems: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: "var(--accent2)", color: "var(--bg)", fontSize: 10, fontWeight: 800 }}>{activeFilters}</span>}
                </span>
                <ChevronDown size={16} color="var(--ink-dim)" style={{ transition: "transform .3s ease", transform: filtersOpen ? "rotate(180deg)" : "none" }} />
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 4, boxSizing: "border-box", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 4 }}>
                {LAYOUTS.map(({ key, Icon }) => (
                  <button key={key} onClick={() => setLayout(key)} aria-label={key === "list" ? "List view" : `${key} grid`} aria-pressed={layout === key}
                    className="layout-btn" style={{ background: layout === key ? "var(--accent2)" : "transparent", color: layout === key ? "var(--bg)" : "var(--ink-dim)" }}>
                    <Icon size={17} />
                  </button>
                ))}
              </div>
            </div>
            <div className={`filter-collapse${filtersOpen ? " open" : ""}`}>
              <div className="filter-grid">
                <Filter label="SYSTEM" value={system} onChange={setSystem}
                  options={[["all", "All systems"], ...systems.map((p) => [p, p] as [string, string])]} />
                <Filter label="WISHLIST" value={wish} onChange={setWish}
                  options={[["all", "All games"], ["yes", "On wishlist"], ["no", "Not wishlisted"]]} />
                <Filter label={<>PLAYER AMOUNT <span style={{ fontWeight: 400, letterSpacing: 0 }}>*may be incomplete</span></>} value={players} onChange={onPlayers} options={PLAYER_OPTIONS} />
                {players !== "all" && (
                  <Filter label="MULTIPLAYER TYPE" value={mpType} onChange={setMpType} options={MP_TYPE_OPTIONS} />
                )}
              </div>
            </div>
          </>
        )}

        {/* Section toggle: game releases vs. industry events. */}
        <div style={{ display: "inline-flex", alignSelf: "flex-start", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 4, gap: 4 }}>
          {([["games", "Games", Gamepad2], ["events", "Events", Radio]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setMode(key)} aria-pressed={mode === key}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: "calc(var(--radius) - 3px)", border: "none", cursor: "pointer", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13, background: mode === key ? "var(--accent2)" : "transparent", color: mode === key ? "var(--bg)" : "var(--ink-dim)" }}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* Result count + reset — games mode only. */}
        {mode === "games" && hasGames && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 2 }}>
            <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{filtered.length} {filtered.length === 1 ? "game" : "games"}</span>
            {hasFilter && (
              <button onClick={() => { setSystem("all"); setWish("all"); setPlayers("all"); setMpType("all"); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--accent2)", fontFamily: "var(--display)", fontSize: 11, fontWeight: 700 }}>
                <X size={12} /> RESET
              </button>
            )}
          </div>
        )}
      </div>

      {mode === "events" ? (
        <EventsContent events={events ?? null} loading={!!eventsLoading} error={!!eventsError} onOpenEvent={onOpenEvent} />
      ) : loading && !games ? (
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
        <>
          {visibleGroups.map((m) => (
            <section key={m.label}>
              <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 18, paddingTop: 4 }}>
                <span style={{ fontFamily: "var(--display)", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{m.label}</span>
                <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{m.total} {m.total === 1 ? "game" : "games"}</span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>
              {isList ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {m.games.map((g) => <UpcomingRow key={g.igdbId} g={g} wishlisted={isWished(g)} owned={isOwned(g)} onWishlist={onWishlist} onUnwishlist={onUnwishlist} onClick={() => onOpen?.(g)} />)}
                </div>
              ) : (
                <div className="card-grid" style={{ gridTemplateColumns: `repeat(auto-fill, ${cfg.col})`, gap: cfg.gap }}>
                  {m.games.map((g) => <UpcomingCard key={g.igdbId} g={g} wishlisted={isWished(g)} owned={isOwned(g)} onWishlist={onWishlist} onUnwishlist={onUnwishlist} onClick={() => onOpen?.(g)} />)}
                </div>
              )}
            </section>
          ))}
          {shownCount < filtered.length && <div ref={sentinel} style={{ height: 1 }} />}
        </>
      )}
    </div>
  );
}

// Compact select styled to match the collection's FilterField, kept local so this
// view stays self-contained (no circular import back into VaultApp).
function Filter({ label, value, onChange, options }: { label: ReactNode; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const current = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <label style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", minWidth: 0 }}>
      <span style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, paddingLeft: 2, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ position: "relative", display: "flex", alignItems: "center", height: 40, boxSizing: "border-box", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "0 30px 0 13px" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current}</span>
        <ChevronDown size={15} color="var(--ink-dim)" style={{ position: "absolute", right: 10, pointerEvents: "none" }} />
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", border: "none", appearance: "none" }}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </label>
  );
}

// ---- EVENTS ----------------------------------------------------------------

// "12 Jun 2026, 18:00" — events carry a time-of-day, unlike releases.
const fmtEventDateTime = (sec: number) =>
  new Date(sec * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Relative phrasing ("in 3 days", "2 weeks ago") for the secondary date line.
const REL = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relTime(sec: number, now: number) {
  const diff = sec - now; // seconds; positive = future
  const abs = Math.abs(diff);
  const DAY = 86400;
  if (abs < 3600) return REL.format(Math.round(diff / 60), "minute");
  if (abs < DAY) return REL.format(Math.round(diff / 3600), "hour");
  if (abs < 30 * DAY) return REL.format(Math.round(diff / DAY), "day");
  if (abs < 365 * DAY) return REL.format(Math.round(diff / (30 * DAY)), "month");
  return REL.format(Math.round(diff / (365 * DAY)), "year");
}

type EventState = "live" | "upcoming" | "passed";

// One event as a wide row: landscape logo, name + date, and a "Watch" link to
// the official stream when there is one. Passed events are dimmed and, when
// `onOpen` is given, clickable (a chevron hints the detail modal).
function EventRow({ e, state, now, onOpen }: { e: GameEvent; state: EventState; now: number; onOpen?: () => void }) {
  const [err, setErr] = useState(false);
  const showLogo = e.logo && !err;
  const start = e.startTime!;
  const clickable = !!onOpen;
  return (
    <div className="upcoming-row game-card"
      onClick={onOpen}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen!(); } } : undefined}
      style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 14px", borderRadius: "var(--radius)", background: "var(--panel)", border: "1px solid var(--line)", minWidth: 0, opacity: state === "passed" ? 0.62 : 1, cursor: clickable ? "pointer" : "default" }}>
      <div style={{ flex: "0 0 auto", width: 86, aspectRatio: "16 / 9", borderRadius: 7, overflow: "hidden", position: "relative", border: "1px solid var(--line)", background: "linear-gradient(150deg, var(--accent)33, var(--panel-alt))", display: "grid", placeItems: "center" }}>
        {showLogo
          ? <img src={e.logo} alt={e.name} loading="lazy" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <Radio size={20} color="var(--accent)" style={{ opacity: .5 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {state === "live" && (
          <div style={{ marginBottom: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 99, background: "var(--accent)", color: "var(--bg)", fontSize: 9.5, fontWeight: 800, fontFamily: "var(--display)", letterSpacing: 0.5 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--bg)" }} /> LIVE
            </span>
          </div>
        )}
        <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
        {state === "live" ? (
          <div style={{ fontSize: 11.5, color: "var(--accent)", fontFamily: "var(--display)", marginTop: 4 }}>Live now</div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtEventDateTime(start)}</div>
            <div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)", opacity: 0.8, marginTop: 2 }}>{relTime(start, now)}</div>
          </>
        )}
      </div>
      {e.liveStreamUrl && state !== "passed" && (
        <a href={e.liveStreamUrl} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
          style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: "var(--radius)", background: "var(--accent2)", color: "var(--bg)", textDecoration: "none", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11.5 }}>
          <ExternalLink size={13} /> Watch
        </a>
      )}
      {clickable && <ChevronRight size={18} color="var(--ink-dim)" style={{ flex: "0 0 auto" }} />}
    </div>
  );
}

// Events section: splits IGDB's industry events into live now / upcoming /
// passed against the current time, soonest-first for the future and most-recent-
// first for the past. `now` is captured once so the buckets stay stable.
function EventsContent({ events, loading, error, onOpenEvent }: { events: GameEvent[] | null; loading: boolean; error: boolean; onOpenEvent?: (e: GameEvent) => void }) {
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const buckets = useMemo(() => {
    const live: GameEvent[] = [], upcoming: GameEvent[] = [], passed: GameEvent[] = [];
    for (const e of events ?? []) {
      const start = e.startTime ?? 0;
      // Assume a ~6h broadcast when IGDB omits an end time.
      const end = e.endTime ?? start + 6 * 3600;
      if (start <= now && now <= end) live.push(e);
      else if (start > now) upcoming.push(e);
      else passed.push(e);
    }
    upcoming.sort((a, b) => a.startTime! - b.startTime!);
    passed.sort((a, b) => b.startTime! - a.startTime!);
    return { live, upcoming, passed };
  }, [events, now]);

  if (loading && !events) {
    return <div style={{ display: "grid", placeItems: "center", padding: "70px 0", color: "var(--ink-dim)" }}><Loader2 size={24} className="spin" /></div>;
  }
  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-dim)" }}>
        <Radio size={38} style={{ opacity: .5 }} />
        <div style={{ marginTop: 12, fontFamily: "var(--display)" }}>COULDN&apos;T LOAD</div>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>Pull to refresh, or try again later.</div>
      </div>
    );
  }
  if (!buckets.live.length && !buckets.upcoming.length && !buckets.passed.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-dim)" }}>
        <Radio size={38} style={{ opacity: .5 }} />
        <div style={{ marginTop: 12, fontFamily: "var(--display)" }}>NO EVENTS</div>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>No tracked showcases right now.</div>
      </div>
    );
  }

  const sections: [string, EventState, GameEvent[]][] = [
    ["LIVE NOW", "live", buckets.live],
    ["UPCOMING", "upcoming", buckets.upcoming],
    ["PASSED", "passed", buckets.passed],
  ];
  return (
    <>
      {/* LIVE/PASSED show only when populated; UPCOMING always shows its heading
          (with an empty-state line) so the section never silently vanishes. */}
      {sections.filter(([, state, list]) => list.length || state === "upcoming").map(([label, state, list]) => (
        <section key={label}>
          <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16, paddingTop: 4 }}>
            <span style={{ fontFamily: "var(--display)", fontSize: 18, fontWeight: 700, letterSpacing: 1, color: state === "live" ? "var(--accent)" : "var(--ink)" }}>{label}</span>
            {list.length > 0 && <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{list.length}</span>}
            <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          {list.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map((e) => <EventRow key={e.id} e={e} state={state} now={now} onOpen={state === "passed" && onOpenEvent ? () => onOpenEvent(e) : undefined} />)}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--ink-dim)", padding: "2px 2px 4px" }}>No new events announced for the coming weeks.</div>
          )}
        </section>
      ))}
    </>
  );
}

// A game announced at an event, as a compact row with a quick wishlist heart.
// Reuses the shared WishlistButton (optimistic toggle) + wishlistToggle so the
// behaviour matches the Upcoming cards; owned games show no heart.
function EventGameRow({ g, wishlisted, owned, onWishlist, onUnwishlist }: { g: UpcomingGame; wishlisted?: boolean; owned?: boolean; onWishlist?: (g: UpcomingGame) => Promise<void> | void; onUnwishlist?: (g: UpcomingGame) => Promise<void> | void }) {
  const [err, setErr] = useState(false);
  const showArt = g.cover && !err;
  const sub = g.platforms.length ? platformLine(g.platforms) : (g.genre || (g.releaseDate ? String(new Date(g.releaseDate * 1000).getFullYear()) : "—"));
  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 46px 8px 10px", borderRadius: "var(--radius)", background: "var(--panel-alt)", border: "1px solid var(--line)", minWidth: 0 }}>
        <div style={{ flex: "0 0 auto", width: 40, aspectRatio: "1 / 1.32", borderRadius: 6, overflow: "hidden", position: "relative", border: "1px solid var(--line)", background: "linear-gradient(150deg, var(--accent)33, var(--panel-alt))" }}>
          {showArt
            ? <img src={g.cover} alt={g.title} loading="lazy" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)", opacity: .5 }}>{(g.title || "?")[0]}</span></div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</div>
          <div style={{ fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
        </div>
      </div>
      <WishlistButton wishlisted={!!wishlisted} onToggle={wishlistToggle(g, owned, onWishlist, onUnwishlist)} style={{ top: "50%", right: 9, transform: "translateY(-50%)" }} />
    </div>
  );
}

// Detail modal for a past event: the showcase's logo/date/blurb + the list of
// games announced there, each with a one-tap wishlist heart. The games are
// fetched lazily on open (in the UpcomingGame shape, so the heart reuses the
// app's existing wishlist plumbing). Mirrors the UpcomingDetail sheet styling.
export function EventDetail({ event, wishlistIds, ownedIds, onWishlist, onUnwishlist, onClose }: {
  event: GameEvent;
  wishlistIds?: Set<number>;
  ownedIds?: Set<number>;
  onWishlist?: (g: UpcomingGame) => Promise<void> | void;
  onUnwishlist?: (g: UpcomingGame) => Promise<void> | void;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const [games, setGames] = useState<UpcomingGame[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoErr, setLogoErr] = useState(false);
  const [now] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    let active = true;
    setGames(null);
    setLoading(true);
    fetch(`/api/events/${event.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("request failed"))))
      .then((d) => { if (active) setGames(Array.isArray(d.games) ? d.games : []); })
      .catch(() => { if (active) setGames([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [event.id]);

  const showLogo = event.logo && !logoErr;
  const dateLine = event.startTime ? `${fmtEventDateTime(event.startTime)} · ${relTime(event.startTime, now)}` : "";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }} className="sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel)", borderBottom: "1px solid var(--line)" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontFamily: "var(--display)", fontSize: 12, fontWeight: 700 }}><ChevronLeft size={17} /> BACK</button>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, fontFamily: "var(--display)", color: "var(--accent3)" }}><Radio size={13} /> EVENT</span>
        </div>
        <div style={{ padding: "20px 20px calc(20px + env(safe-area-inset-bottom))", overflowY: "auto", overflowX: "hidden", flex: 1, minHeight: 0 }}>
          <div style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: "var(--radius)", overflow: "hidden", position: "relative", border: "1px solid var(--line)", background: "linear-gradient(150deg, var(--accent)33, var(--panel-alt))", display: "grid", placeItems: "center" }}>
            {showLogo
              ? <img src={event.logo} alt={event.name} onError={() => setLogoErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <Radio size={40} color="var(--accent)" style={{ opacity: .5 }} />}
          </div>
          <h1 style={{ fontFamily: "var(--display)", fontSize: 22, lineHeight: 1.18, margin: "16px 0 0", fontWeight: 800 }}>{event.name}</h1>
          {dateLine && <div style={{ fontSize: 12.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 7 }}>{dateLine}</div>}
          {event.liveStreamUrl && (
            <a href={event.liveStreamUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 13, padding: "9px 14px", borderRadius: "var(--radius)", background: "var(--accent2)", color: "var(--bg)", textDecoration: "none", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12.5 }}>
              <ExternalLink size={14} /> Watch recap
            </a>
          )}
          {event.description && <p style={{ fontSize: 14, lineHeight: 1.6, margin: "16px 0 0", color: "var(--ink)" }}>{event.description}</p>}

          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 11 }}>
              GAMES ANNOUNCED{games?.length ? ` · ${games.length}` : ""}
            </div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 56, borderRadius: "var(--radius)" }} />)}
              </div>
            ) : !games?.length ? (
              <div style={{ fontSize: 13, color: "var(--ink-dim)", padding: "6px 2px" }}>No games linked to this event on IGDB.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {games.map((g) => (
                  <EventGameRow key={g.igdbId} g={g}
                    wishlisted={!!wishlistIds?.has(g.igdbId)}
                    owned={!!ownedIds?.has(g.igdbId)}
                    onWishlist={onWishlist} onUnwishlist={onUnwishlist} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
