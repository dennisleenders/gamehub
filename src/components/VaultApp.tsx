"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, X, Gamepad2, Trophy, Heart, Disc, LayoutGrid, Sparkles, Check, Box, CircleUser,
  ChevronLeft, ChevronRight, ChevronDown, Pencil, Loader2, ImageIcon, Library, Joystick,
  ScanLine, Settings, LogOut, Clock, Tag, Star, CalendarClock, Play, Minus,
  Home, Ticket, Copy, RefreshCw, Crown, UserMinus, Trash2, Users, Grid2x2, List, SlidersHorizontal, Radio,
} from "lucide-react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useVault } from "@/lib/useVault";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useLazyList } from "@/lib/useLazyList";
import AchievementsView, { CreateChallengeModal, RankingBoard } from "@/components/AchievementsView";
import UpcomingView, { UpcomingRail, UpcomingCover, EventsRail, EventDetail } from "@/components/UpcomingView";
import { useUpcoming } from "@/lib/useUpcoming";
import { useEvents } from "@/lib/useEvents";
import { useAchievementToasts } from "@/components/useAchievementToasts";
import { Avatar, AvatarPickerModal } from "@/components/Avatar";
import Splash from "@/components/Splash";
import TutorialOverlay, { type TutorialStep } from "@/components/TutorialOverlay";
import { avatarSrc } from "@/lib/avatars";
import {
  type Game, type Profile, type PlayStatus, type UpcomingGame, type GameEvent, type Household, type HouseholdRole,
  type MemberWithProfile, PLAY_STATUS, PLATFORM_TINT,
  CONDITIONS, PLATFORMS, OVERVIEW_SECTIONS, money, fmtDate, igdbPlatformsToApp,
} from "@/lib/types";

const FALLBACK_TINTS = ["#9b8cff", "#6fc7b3", "#e6b667", "#e0738a", "#7fb2ff", "#c98cff"];
const hashIdx = (s = "", n = 1) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return h % n; };
const tintFor = (p: string) => PLATFORM_TINT[p] || FALLBACK_TINTS[hashIdx(p, FALLBACK_TINTS.length)];
const playColor = (k: string) => k === "playing" ? "var(--accent2)" : k === "finished" ? "var(--good)" : k === "abandoned" ? "var(--bad)" : "var(--ink-dim)";
const getProg = (g: Game, uid?: string) => (uid && g.progress?.[uid]) || { status: "collection" as PlayStatus, hours: 0 };
// The neutral, no-intent statuses: a game just sitting in the vault ("collection")
// or merely flagged to play someday ("backlog"). Neither counts as having played
// it, so both are excluded from "recently played" and "who's played it".
const isUnplayed = (s: PlayStatus) => s === "collection" || s === "backlog";
// Condition is shown verbatim (Sealed / CIB / Loose) — the stored value is the label.
const conditionLabel = (c?: string | null) => c ?? "";

// PriceCharting returns loose/CIB/new prices; pick the tier matching the game's
// condition (Sealed→new, CIB→cib, Loose→loose). Falls back across tiers if the
// preferred one is missing so we still surface a number. Cents in, cents out.
type PriceTiers = { loose: number | null; cib: number | null; new: number | null };
const tierForCondition = (t: PriceTiers, condition: string): number | null => {
  const preferred = condition === "Sealed" ? t.new : condition === "Loose" ? t.loose : t.cib;
  return preferred ?? t.cib ?? t.loose ?? t.new ?? null;
};

// EUR-cent price payload returned by /api/upc and /api/metadata.
type PricePayload = { pricecharting_id: string | null; name: string; loose_cents: number | null; cib_cents: number | null; new_cents: number | null };
// What the scanner hands back: the resolved title plus, when PriceCharting named
// it, the scanned barcode and its price/id so the form opens pre-priced.
type ScanResult = { title: string; upc?: string; price?: PricePayload | null; pricecharting_id?: string | null };
// Seed passed into GameModal — a Game plus scan-only extras the Game table doesn't store.
type GameSeed = Partial<Game> & { upc?: string | null; priceTiers?: PriceTiers | null };
const progressEntries = (g: Game) => Object.entries(g.progress || {});
const playersOf = (g: Game) => progressEntries(g).filter(([, p]) => p.status === "playing");
const finishersOf = (g: Game) => progressEntries(g).filter(([, p]) => p.status === "finished");
const abandonersOf = (g: Game) => progressEntries(g).filter(([, p]) => p.status === "abandoned");

// Grid-density / list toggle for the collection, mirroring the Upcoming view.
// `col` feeds an auto-fill template so column count tracks the viewport; list
// mode ignores it and renders stacked rows.
const COLLECTION_LAYOUTS = [
  { key: "comfortable", Icon: Grid2x2, col: "minmax(150px, 1fr)", gap: "18px 14px" },
  { key: "standard", Icon: LayoutGrid, col: "minmax(100px, 1fr)", gap: "16px 12px" },
  { key: "list", Icon: List, col: "", gap: "" },
] as const;
type CollectionLayout = (typeof COLLECTION_LAYOUTS)[number]["key"];

// First-run dashboard tour. Each step spotlights a real element (tagged with a
// matching `data-tut` attribute). Bump the version key below if these change and
// you want returning users to see the tour again.
const TUTORIAL_VERSION = 1;
const TUTORIAL_STEPS: TutorialStep[] = [
  { selector: '[data-tut="account"]', title: "Make it yours", body: "Your profile lives here — pick an avatar and colour, or sign out." },
  { selector: '[data-tut="settings"]', title: "Settings", body: "Rename your vault, manage who's in it, and tune what shows on your dashboard." },
  { selector: '[data-tut="scan"]', title: "Scan the box", body: "Got the physical copy in hand? Scan its barcode and we'll look up the game and its value for you." },
  { selector: '[data-tut="add"]', title: "Add a game", body: "Tap + to add a game — search by title for instant cover art and details, or fill it in yourself." },
  { selector: '[data-tut="nav"]', title: "Find your way", body: "Move between your dashboard, full collection, upcoming releases and the achievements you're chasing." },
];

export default function VaultApp({ currentUser, household, role }: { currentUser: Profile; household: Household; role: HouseholdRole }) {
  const uid = currentUser.id;
  const { games, profiles, members, challenges, genres, priceChartingEnabled, priceChartingTokenSet, loading, saveGame, deleteGame, saveChallenge, deleteChallenge, saveSettings, savePreferences, saveProfile, renameVault, regenerateInvite, removeMember, leaveVault } = useVault(uid, household.id);
  const userById = (id?: string | null) => profiles.find((p) => p.id === id) || null;

  // Live current profile (reflects reloads after saving prefs); falls back to the
  // server-passed prop before the first load completes.
  const me = profiles.find((p) => p.id === uid) ?? currentUser;
  const showSection = (key: string) => me.preferences?.overview?.[key] !== false;

  const [view, setView] = useState<"home" | "collection" | "achievements" | "upcoming">("home");
  const [detail, setDetail] = useState<Game | null>(null);
  // The upcoming release whose detail modal is open (separate from `detail`, which
  // is for collection games — upcoming games aren't in our DB).
  const [upcomingDetail, setUpcomingDetail] = useState<UpcomingGame | null>(null);
  const [eventDetail, setEventDetail] = useState<GameEvent | null>(null);
  const [editing, setEditing] = useState<GameSeed | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  // True from the moment we know a first-run tour will appear until it's
  // dismissed — including the splash + pre-show gap before the overlay mounts.
  const [tourPending, setTourPending] = useState(false);
  const tutorialKey = `gv-tutorial-v${TUTORIAL_VERSION}-${uid}`;
  const dismissTutorial = useCallback(() => {
    try { localStorage.setItem(tutorialKey, "1"); } catch { /* private mode: just close */ }
    setShowTutorial(false);
    setTourPending(false);
  }, [tutorialKey]);
  // The tour is on screen only on the dashboard with no modal stacked over it.
  const tutorialActive = showTutorial && view === "home" && !detail && !editing && !settingsOpen && !scanOpen && !avatarOpen;
  // Tell the global iOS install hint to stay hidden while a tour is pending or on
  // screen (it lives in the root layout, out of this tree's reach). Pages without
  // a dashboard never set this, so the hint behaves normally there.
  const suppressInstallHint = tutorialActive || tourPending;
  useEffect(() => {
    (window as Window & { __gvSuppressInstall?: boolean }).__gvSuppressInstall = suppressInstallHint;
    window.dispatchEvent(new CustomEvent("gv:install-suppress", { detail: suppressInstallHint }));
  }, [suppressInstallHint]);

  // Switching views (via the bottom nav or a dashboard shortcut) should always
  // land you at the top of the new page rather than keeping the old scroll.
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  // On the installed PWA, hold the launch splash for a minimum beat so it doesn't
  // flash past, and so the native launch splash → streamed loading.tsx splash →
  // this one read as a single uninterrupted screen rather than handing off to a
  // second, different spinner. A browser tab has no native splash to bridge, so we
  // skip the floor there and just show the splash until data is in.
  const [minSplash, setMinSplash] = useState(true);
  useEffect(() => {
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true);
    if (!standalone) { setMinSplash(false); return; }
    const t = setTimeout(() => setMinSplash(false), 2000);
    return () => clearTimeout(t);
  }, []);

  // First-run tour: show it once per user (per browser) the first time they land
  // on a ready dashboard. The short delay lets the dashboard paint so the
  // spotlight's targets are laid out before it measures them.
  useEffect(() => {
    if (loading || minSplash) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(tutorialKey)) { setTourPending(false); return; }
    setTourPending(true); // first-run: claim priority over the install hint now
    const t = setTimeout(() => setShowTutorial(true), 700);
    return () => clearTimeout(t);
  }, [loading, minSplash, tutorialKey]);

  // Pop a toast whenever you cross an achievement tier. Gated on !loading so the
  // baseline is taken from fully-loaded data (no notification spam on first load).
  useAchievementToasts(games, profiles, uid, !loading);

  // Upcoming releases (IGDB) — fetched lazily, only once the dashboard block is
  // shown or the Upcoming view is opened, so we don't hit IGDB needlessly.
  const upcomingEnabled = showSection("upcoming") || view === "upcoming";
  const { games: upcoming, loading: upcomingLoading, error: upcomingError } = useUpcoming(upcomingEnabled);
  // Industry events (IGDB) — needed by the Upcoming view's Events section and the
  // optional dashboard rail; fetched lazily once either is shown.
  const eventsEnabled = showSection("events") || view === "upcoming";
  const { events, loading: eventsLoading, error: eventsError } = useEvents(eventsEnabled);
  // Which Upcoming sub-section the view opens on. The dashboard's events rail
  // sets this to "events" before navigating so SEE ALL lands on the right tab.
  const [upcomingMode, setUpcomingMode] = useState<"games" | "events">("games");

  const resolveUpc = async (upc: string): Promise<{ title: string | null; error?: string; resetAt?: number; price?: PricePayload | null; pricecharting_id?: string | null }> => {
    const r = await fetch("/api/upc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upc }) });
    if (!r.ok) return { title: null, error: "network" };
    return r.json();
  };

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [playFilter, setPlayFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [sort, setSort] = useState("recent");
  const [layout, setLayout] = useState<CollectionLayout>("comfortable");
  // The filter block is collapsed by default behind a "Filters" button to keep
  // the collection header compact; it slides open on demand.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Bottom-nav "orb": one accent pill that slides to the active tab instead of a
  // per-button background. Positions are measured (labels make the buttons
  // unequal widths), and re-measured on resize / font load.
  const navTrackRef = useRef<HTMLDivElement>(null);
  const navBtnRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const [orb, setOrb] = useState({ left: 0, top: 0, width: 0, height: 0 });
  // Transitions stay off until the orb's initial position has painted, so it
  // doesn't slide/scale in from the corner on first load — only later tab
  // changes animate. The ref guards against re-arming on every measure.
  const [orbReady, setOrbReady] = useState(false);
  const orbReadyRef = useRef(false);
  const measureOrb = useCallback((v: string) => {
    const btn = navBtnRef.current[v];
    if (!btn) return;
    setOrb({ left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight });
    if (!orbReadyRef.current) {
      orbReadyRef.current = true;
      // Two frames: let the snapped position commit before transitions turn on.
      requestAnimationFrame(() => requestAnimationFrame(() => setOrbReady(true)));
    }
  }, []);
  // Snap before paint on tab change (no first-frame slide from 0,0); re-measure
  // when the layout shifts (resize crosses the label breakpoint, fonts settle).
  // `loading`/`minSplash` are deps so we re-measure the moment the splash clears
  // and the nav finally mounts — otherwise the orb stays unmeasured (invisible)
  // on first load, since `view` never changed to retrigger this.
  useLayoutEffect(() => { measureOrb(view); }, [view, measureOrb, loading, minSplash]);
  useEffect(() => {
    const onResize = () => measureOrb(view);
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(onResize).catch(() => {});
    return () => window.removeEventListener("resize", onResize);
  }, [view, measureOrb, loading, minSplash]);

  const owned = games.filter((g) => g.status === "owned");
  const wishlist = games.filter((g) => g.status === "wishlist");
  const collectionValue = owned.reduce((s, g) => s + (g.value_cents || 0), 0);

  // IGDB ids of wishlisted games, so the Upcoming view/rail can flag (and filter
  // by) releases that are already on the wishlist. Matched on igdb_id.
  const wishlistIgdbIds = useMemo(
    () => new Set(games.filter((g) => g.status === "wishlist" && g.igdb_id != null).map((g) => g.igdb_id as number)),
    [games],
  );
  // IGDB ids already in the collection as owned — so the Upcoming view hides the
  // quick-wishlist heart on them (can't wishlist something you already own).
  const ownedIgdbIds = useMemo(
    () => new Set(games.filter((g) => g.status === "owned" && g.igdb_id != null).map((g) => g.igdb_id as number)),
    [games],
  );

  // One-tap wishlist straight from an Upcoming card — no detail modal. Enriches
  // with the same best-effort IGDB metadata the modal's add does, assigns the
  // first listed platform, then writes through saveGame.
  const wishlistUpcoming = async (g: UpcomingGame) => {
    let meta: UpcomingMeta = null;
    try {
      const r = await fetch("/api/metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: g.title }) });
      if (r.ok) meta = await r.json();
    } catch { /* metadata is best-effort; add with the core fields regardless */ }
    await saveGame(upcomingWishlistPayload(g, meta));
  };

  // Tapping a filled heart removes the matching wishlist entry (deletes the row —
  // a wishlist game is just a games row with status "wishlist").
  const unwishlistUpcoming = async (g: UpcomingGame) => {
    const existing = games.find((x) => x.igdb_id === g.igdbId && x.status === "wishlist");
    if (existing) await deleteGame(existing.id);
  };

  // The collection game (if any) that matches the open upcoming release, so its
  // modal can show "already added" instead of an add button.
  const upcomingExisting = upcomingDetail ? games.find((g) => g.igdb_id === upcomingDetail.igdbId) ?? null : null;

  const playingSlides: { g: Game; pid: string; hours: number }[] = [];
  owned.forEach((g) => playersOf(g).forEach(([pid, p]) => playingSlides.push({ g, pid, hours: p.hours })));
  playingSlides.sort((a, b) => (a.pid === uid ? 0 : 1) - (b.pid === uid ? 0 : 1));

  const myFinished = owned.filter((g) => getProg(g, uid).status === "finished").length;
  const myBacklog = owned.filter((g) => getProg(g, uid).status === "backlog").length;

  // Games the current user has actually played (playing/finished), most recently touched first.
  const recentlyPlayed = owned
    .map((g) => ({ g, p: g.progress?.[uid] }))
    .filter((x) => x.p && !isUnplayed(x.p.status) && x.p.updated_at)
    .sort((a, b) => (b.p!.updated_at! < a.p!.updated_at! ? -1 : 1))
    .map((x) => ({ g: x.g, p: x.p! }));

  const byPlatform = PLATFORMS.map((p) => ({ p, count: owned.filter((g) => g.platform === p).length }))
    .filter((x) => x.count).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...byPlatform.map((x) => x.count));
  const recent = [...games];
  const mostValued = [...owned].filter((g) => (g.value_cents || 0) > 0).sort((a, b) => (b.value_cents || 0) - (a.value_cents || 0));

  // The open detail sheet tracks live data so edits/replays reflect immediately
  // (detail only remembers WHICH game is open; the data comes from `games`).
  const liveDetail = detail ? games.find((x) => x.id === detail.id) ?? detail : null;

  const filtered = useMemo(() => {
    const list = games.filter((g) => {
      if (q && !g.title.toLowerCase().includes(q.toLowerCase())) return false;
      if (status !== "all" && g.status !== status) return false;
      if (platform !== "all" && g.platform !== platform) return false;
      const playActive = playFilter !== "all" || playerFilter !== "all";
      if (playActive) {
        if (g.status !== "owned") return false;
        if (playerFilter === "all") {
          if (playFilter === "collection") {
            // "In Collection" for everyone = nobody has an active status. A
            // missing row defaults to collection, so we only need to ensure no
            // stored row is playing/finished/abandoned/backlog.
            if (progressEntries(g).some(([, p]) => p.status !== "collection")) return false;
          } else if (!progressEntries(g).some(([, p]) => p.status === playFilter)) return false;
        } else {
          const st = getProg(g, playerFilter).status;
          if (playFilter === "all") { if (st === "collection") return false; }
          else if (st !== playFilter) return false;
        }
      }
      return true;
    });
    const cmp: Record<string, (a: Game, b: Game) => number> = {
      recent: () => 0,
      name: (a, b) => a.title.localeCompare(b.title),
      value: (a, b) => (b.value_cents || 0) - (a.value_cents || 0),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    };
    return [...list].sort(cmp[sort]);
  }, [games, q, status, platform, playFilter, playerFilter, sort]);

  // Render the collection in pages so a large library paints fast; more reveal
  // as the sentinel scrolls into view. The reset key is a stable string of the
  // active filters (NOT the `filtered` array) so a background re-render that
  // hands us a fresh `games` reference can't keep snapping us back to page one.
  const { count: shownCount, sentinel: collSentinel } = useLazyList(filtered.length, `${q} ${status} ${platform} ${playFilter} ${playerFilter} ${sort}`);

  // Same Splash the native launch image and loading.tsx render, so the data-load
  // wait is visually continuous with them — one splash, not two stacked loaders.
  if (loading || minSplash) return <Splash />;

  const topbar = (floating: boolean) => (
    <TopBar floating={floating} currentUser={me} userMenu={userMenu} setUserMenu={setUserMenu}
      onScan={() => setScanOpen(true)}
      onSettings={() => setSettingsOpen(true)}
      onChooseAvatar={() => setAvatarOpen(true)}
      onHome={() => setView("home")}
      onAdd={() => setEditing({})} />
  );

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {view === "home" && (
        <>
          <div style={{ position: "relative" }}>
            <ImmersiveHero slides={playingSlides} userById={userById} currentUser={currentUser} onOpen={setDetail} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}>{topbar(true)}</div>
          </div>
          <div style={{ position: "relative", maxWidth: 940, margin: "-1px auto 0", background: "var(--bg)", padding: "16px 16px 110px" }}>
            <div className="fade home-col" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
              <section>
                <div style={{ fontSize: 11, letterSpacing: 2, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 14 }}>YOUR COLLECTION</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: "var(--display)", fontSize: 64, lineHeight: .9 }}>{owned.length}</div>
                  <div style={{ fontSize: 15, color: "var(--ink-dim)", paddingBottom: 6 }}>games owned</div>
                </div>
                <div data-tut="stats" style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                  <MiniStat icon={Library} label="BACKLOG" value={myBacklog} color="var(--accent3)"
                    onClick={() => { setQ(""); setStatus("owned"); setPlatform("all"); setPlayerFilter(uid); setPlayFilter("backlog"); setView("collection"); }} />
                  <MiniStat icon={Check} label="FINISHED" value={myFinished} color="var(--good)"
                    onClick={() => { setQ(""); setStatus("owned"); setPlatform("all"); setPlayerFilter(uid); setPlayFilter("finished"); setView("collection"); }} />
                  <MiniStat icon={Heart} label="WISHLIST" value={wishlist.length} color="var(--accent)"
                    onClick={() => { setQ(""); setStatus("wishlist"); setPlatform("all"); setPlayerFilter("all"); setPlayFilter("all"); setView("collection"); }} />
                </div>
              </section>

              {showSection("ranking") && (
              <section>
                <SectionHead icon={Trophy} accent="var(--accent3)">RANKING</SectionHead>
                <RankingBoard games={games} profiles={profiles} currentUser={me} />
              </section>
              )}

              {showSection("recently_added") && (
              <section>
                <SectionHead icon={Sparkles} accent="var(--accent)">RECENTLY ADDED</SectionHead>
                <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }} className="hide-scroll">
                  {recent.slice(0, 8).map((g) => (
                    <button key={g.id} onClick={() => setDetail(g)} className="shelf-item" style={{ flex: "0 0 auto", width: 122, color: "var(--ink)" }}>
                      <Cover g={g} ratio={1.32} profiles={profiles} />
                      <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, lineHeight: 1.2, height: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.title}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 3 }}>{g.platform}</div>
                    </button>
                  ))}
                </div>
              </section>
              )}

              {showSection("recently_played") && recentlyPlayed.length > 0 && (
                <section>
                  <SectionHead icon={Joystick} accent="var(--accent2)">RECENTLY PLAYED</SectionHead>
                  <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }} className="hide-scroll">
                    {recentlyPlayed.slice(0, 8).map(({ g, p }) => (
                      <button key={g.id} onClick={() => setDetail(g)} className="shelf-item" style={{ flex: "0 0 auto", width: 122, color: "var(--ink)" }}>
                        <Cover g={g} ratio={1.32} profiles={profiles} />
                        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, lineHeight: 1.2, height: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: playColor(p.status), fontFamily: "var(--display)", marginTop: 3 }}>
                          {p.status === "playing" && <span className="pulse" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent2)" }} />}
                          {p.status === "finished" && <Check size={11} strokeWidth={3} />}
                          {p.status === "abandoned" && <X size={11} strokeWidth={3} />}
                          {p.hours}h played
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {showSection("upcoming") && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <CalendarClock size={15} color="var(--accent3)" />
                    <span style={{ fontSize: 12, letterSpacing: 1.5, fontFamily: "var(--display)", fontWeight: 700 }}>UPCOMING GAMES</span>
                    <button onClick={() => { setUpcomingMode("games"); setView("upcoming"); }}
                      style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--accent2)", fontFamily: "var(--display)", fontSize: 11, fontWeight: 700 }}>
                      SEE ALL
                    </button>
                  </div>
                  <UpcomingRail games={upcoming} loading={upcomingLoading} error={upcomingError} wishlistIds={wishlistIgdbIds} onOpen={setUpcomingDetail} />
                </section>
              )}

              {showSection("events") && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <Radio size={15} color="var(--accent3)" />
                    <span style={{ fontSize: 12, letterSpacing: 1.5, fontFamily: "var(--display)", fontWeight: 700 }}>GAME EVENTS</span>
                    <button onClick={() => { setUpcomingMode("events"); setView("upcoming"); }}
                      style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--accent2)", fontFamily: "var(--display)", fontSize: 11, fontWeight: 700 }}>
                      SEE ALL
                    </button>
                  </div>
                  <EventsRail events={events} loading={eventsLoading} error={eventsError} onOpen={() => { setUpcomingMode("events"); setView("upcoming"); }} />
                </section>
              )}

              {showSection("most_valued") && mostValued.length > 0 && (
                <section>
                  <SectionHead icon={Trophy} accent="var(--accent3)">MOST VALUED</SectionHead>
                  <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }} className="hide-scroll">
                    {mostValued.slice(0, 8).map((g) => (
                      <button key={g.id} onClick={() => setDetail(g)} className="shelf-item" style={{ flex: "0 0 auto", width: 122, color: "var(--ink)" }}>
                        <Cover g={g} ratio={1.32} profiles={profiles} />
                        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8, lineHeight: 1.2, height: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.title}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent3)", fontFamily: "var(--display)", marginTop: 3 }}>{money(g.value_cents)}</div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {showSection("by_system") && (
              <section>
                <SectionHead icon={Gamepad2} accent="var(--accent2)">BY SYSTEM</SectionHead>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {byPlatform.map((x) => (
                    <button key={x.p} onClick={() => { setPlatform(x.p); setStatus("owned"); setView("collection"); }}
                      style={{ display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", color: "var(--ink)" }}>
                      <div style={{ width: 44, fontFamily: "var(--display)", fontSize: 12, fontWeight: 700 }}>{x.p}</div>
                      <div style={{ flex: 1, height: 12, background: "var(--panel)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--line)" }}>
                        <div style={{ height: "100%", width: `${(x.count / maxCount) * 100}%`, background: tintFor(x.p) }} />
                      </div>
                      <div style={{ width: 34, textAlign: "right", fontFamily: "var(--display)", fontSize: 13, color: "var(--ink-dim)" }}>{x.count}</div>
                    </button>
                  ))}
                </div>
              </section>
              )}

              {showSection("collection_value") && (
              <section>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "13px 16px" }}>
                  <div style={{ fontSize: 11, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>EST. COLLECTION VALUE</div>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 }}>{money(collectionValue)}</span>
                </div>
              </section>
              )}
            </div>
          </div>
        </>
      )}

      {view === "collection" && (
        <div style={{ position: "relative", maxWidth: 940, margin: "0 auto", padding: "0 16px 110px" }}>
          {topbar(false)}
          <div className="fade">
            <div style={{ height: 1, background: "linear-gradient(to right, transparent, var(--line) 12%, var(--line) 88%, transparent)", margin: "0 0 18px" }} />
            <h1 style={{ fontFamily: "var(--display)", fontSize: 28, fontWeight: 800, letterSpacing: -0.5, margin: "2px 2px 16px" }}>Collection</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "11px 14px", marginBottom: 12 }}>
              <Search size={18} color="var(--ink-dim)" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", fontSize: 15, fontFamily: "var(--body)" }} />
              {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><X size={16} /></button>}
            </div>
            {(() => { const activeFilters = [status, playerFilter, playFilter, platform].filter((v) => v !== "all").length; return (
            <button onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "11px 14px", cursor: "pointer", color: "var(--ink)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SlidersHorizontal size={16} color="var(--ink-dim)" /> Filters
                {activeFilters > 0 && <span style={{ display: "grid", placeItems: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: "var(--accent2)", color: "var(--bg)", fontSize: 10, fontWeight: 800 }}>{activeFilters}</span>}
              </span>
              <ChevronDown size={16} color="var(--ink-dim)" style={{ transition: "transform .3s ease", transform: filtersOpen ? "rotate(180deg)" : "none" }} />
            </button>
            ); })()}
            <div className={`filter-collapse${filtersOpen ? " open" : ""}`}>
              <div className="filter-grid">
                <FilterField label="Library" value={status} onChange={(v) => { setStatus(v); if (v === "wishlist") { setPlayerFilter("all"); setPlayFilter("all"); } }} options={[["all", "All games"], ["owned", "Owned"], ["wishlist", "Wishlist"]]} />
                <FilterField label="Player" value={playerFilter} onChange={setPlayerFilter} disabled={status === "wishlist"} options={[["all", "All players"], ...profiles.map((a) => [a.id, a.name] as [string, string])]} />
                <FilterField label="Status" value={playFilter} onChange={setPlayFilter} disabled={status === "wishlist"} options={[["all", "Any status"], ["playing", "Playing"], ["finished", "Finished"], ["backlog", "Backlog"], ["abandoned", "Abandoned"], ["collection", "In Collection"]]} />
                <FilterField label="System" value={platform} onChange={setPlatform} options={[["all", "All systems"], ...PLATFORMS.map((p) => [p, p] as [string, string])]} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 2px 16px", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: "var(--ink-dim)", fontFamily: "var(--display)", flexShrink: 0 }}>{filtered.length} {filtered.length === 1 ? "game" : "games"}</span>
                {(status !== "all" || playerFilter !== "all" || playFilter !== "all" || platform !== "all" || q) && (
                  <button onClick={() => { setStatus("all"); setPlayerFilter("all"); setPlayFilter("all"); setPlatform("all"); setQ(""); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--accent2)", fontFamily: "var(--display)", fontSize: 11, fontWeight: 700 }}>
                    <X size={12} /> RESET
                  </button>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, height: 38, boxSizing: "border-box", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 4 }}>
                  {COLLECTION_LAYOUTS.map(({ key, Icon }) => (
                    <button key={key} onClick={() => setLayout(key)} aria-label={key === "list" ? "List view" : `${key} grid`} aria-pressed={layout === key}
                      className="layout-btn" style={{ background: layout === key ? "var(--accent2)" : "transparent", color: layout === key ? "var(--bg)" : "var(--ink-dim)" }}>
                      <Icon size={17} />
                    </button>
                  ))}
                </div>
                <FilterField compact value={sort} onChange={setSort} options={[["recent", "Newest"], ["name", "A–Z"], ["value", "Value"], ["rating", "Rating"]]} />
              </div>
            </div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-dim)" }}>
                <Disc size={40} style={{ opacity: .5 }} />
                <div style={{ marginTop: 12, fontFamily: "var(--display)" }}>NO GAMES FOUND</div>
              </div>
            ) : layout === "list" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filtered.slice(0, shownCount).map((g) => <GameRow key={g.id} g={g} profiles={profiles} onClick={() => setDetail(g)} />)}
              </div>
            ) : (
              <div className="card-grid" style={{ gridTemplateColumns: `repeat(auto-fill, ${COLLECTION_LAYOUTS.find((l) => l.key === layout)!.col})`, gap: COLLECTION_LAYOUTS.find((l) => l.key === layout)!.gap }}>
                {filtered.slice(0, shownCount).map((g) => <GameCard key={g.id} g={g} profiles={profiles} onClick={() => setDetail(g)} />)}
              </div>
            )}
            {shownCount < filtered.length && <div ref={collSentinel} style={{ height: 1 }} />}
          </div>
        </div>
      )}

      {view === "achievements" && (
        <div style={{ position: "relative", maxWidth: 940, margin: "0 auto", padding: "0 16px 110px" }}>
          {topbar(false)}
          <div className="fade">
            <div style={{ height: 1, background: "linear-gradient(to right, transparent, var(--line) 12%, var(--line) 88%, transparent)", margin: "0 0 18px" }} />
            <h1 style={{ fontFamily: "var(--display)", fontSize: 28, fontWeight: 800, letterSpacing: -0.5, margin: "2px 2px 16px" }}>Achievements</h1>
          </div>
          <AchievementsView games={games} profiles={profiles} challenges={challenges} currentUser={me}
            deleteChallenge={deleteChallenge}
            onCreateChallenge={() => setCreatingChallenge(true)} />
        </div>
      )}

      {view === "upcoming" && (
        <div style={{ position: "relative", maxWidth: 940, margin: "0 auto", padding: "0 16px 110px" }}>
          {topbar(false)}
          <div className="fade">
            <div style={{ height: 1, background: "linear-gradient(to right, transparent, var(--line) 12%, var(--line) 88%, transparent)", margin: "0 0 18px" }} />
            <h1 style={{ fontFamily: "var(--display)", fontSize: 28, fontWeight: 800, letterSpacing: -0.5, margin: "2px 2px 16px" }}>Upcoming</h1>
          </div>
          <UpcomingView games={upcoming} loading={upcomingLoading} error={upcomingError} events={events} eventsLoading={eventsLoading} eventsError={eventsError} initialMode={upcomingMode} wishlistIds={wishlistIgdbIds} ownedIds={ownedIgdbIds} onWishlist={wishlistUpcoming} onUnwishlist={unwishlistUpcoming} onOpen={setUpcomingDetail} onOpenEvent={setEventDetail} />
        </div>
      )}

      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, display: "flex", justifyContent: "center",
        padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", background: "linear-gradient(to top, var(--bg) 60%, transparent)", pointerEvents: "none" }}>
        <div data-tut="nav" ref={navTrackRef} style={{ position: "relative", display: "flex", gap: 6, background: "var(--panel)", padding: 5, borderRadius: 99, border: "1px solid var(--line)", boxShadow: "0 8px 28px -8px #000", pointerEvents: "auto" }}>
          <div aria-hidden style={{ position: "absolute", left: orb.left, top: orb.top, width: orb.width, height: orb.height,
            borderRadius: 99, background: me.color, zIndex: 0, opacity: orb.width ? 1 : 0,
            transition: orbReady ? "left .34s cubic-bezier(.2,.85,.25,1), top .34s cubic-bezier(.2,.85,.25,1), width .34s cubic-bezier(.2,.85,.25,1), height .34s cubic-bezier(.2,.85,.25,1)" : "none" }} />
          {([["home", "DASHBOARD", CircleUser], ["collection", "COLLECTION", LayoutGrid], ["upcoming", "UPCOMING", CalendarClock], ["achievements", "ACHIEVEMENTS", Trophy]] as const).map(([k, lbl, Ic]) => (
            <button key={k} ref={(el) => { navBtnRef.current[k] = el; }} onClick={() => { if (k === "upcoming") setUpcomingMode("games"); setView(k); }} aria-label={lbl} className="nav-pill"
              style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", cursor: "pointer",
                borderRadius: 99, fontFamily: "var(--display)", fontWeight: 700, fontSize: 12, letterSpacing: 1, background: "transparent",
                color: view === k ? "var(--bg)" : "var(--ink-dim)", transition: "color .2s ease" }}>
              <Ic size={15} strokeWidth={2.5} /> <span className="nav-label">{lbl}</span>
            </button>
          ))}
        </div>
      </nav>

      {liveDetail && <DetailView game={liveDetail} userById={userById} currentUser={me}
        onProgress={(status, hours) => saveGame({ id: liveDetail.id, status: "owned", myStatus: status, myHours: hours })}
        onSetValue={(cents) => saveGame({ id: liveDetail.id, value_cents: cents })}
        onClose={() => setDetail(null)} onEdit={() => setEditing(liveDetail)} />}
      {upcomingDetail && (
        <UpcomingDetail
          g={upcomingDetail}
          existingStatus={upcomingExisting?.status ?? null}
          onClose={() => setUpcomingDetail(null)}
          onAdd={(payload) => saveGame(payload)} />
      )}
      {eventDetail && (
        <EventDetail
          event={eventDetail}
          wishlistIds={wishlistIgdbIds}
          ownedIds={ownedIgdbIds}
          onWishlist={wishlistUpcoming}
          onUnwishlist={unwishlistUpcoming}
          onClose={() => setEventDetail(null)} />
      )}
      {editing !== null && (
        <GameModal game={editing} currentUser={currentUser} genres={genres} priceEnabled={priceChartingEnabled}
          onClose={() => setEditing(null)}
          onSave={async (g) => { await saveGame(g); setEditing(null); }}
          onDelete={async (id) => { await deleteGame(id); setEditing(null); setDetail(null); }} />
      )}
      {settingsOpen && (
        <SettingsModal preferences={me.preferences} priceEnabled={priceChartingEnabled} priceTokenSet={priceChartingTokenSet}
          household={household} role={role} members={members} currentUserId={uid}
          onRenameVault={renameVault} onRegenerateInvite={regenerateInvite} onRemoveMember={removeMember} onLeaveVault={leaveVault}
          onSave={saveSettings} onSavePreferences={savePreferences} onClose={() => setSettingsOpen(false)} />
      )}
      {creatingChallenge && (
        <CreateChallengeModal currentUser={me} onClose={() => setCreatingChallenge(false)}
          onSave={async (c) => { await saveChallenge(c); setCreatingChallenge(false); }} />
      )}
      {avatarOpen && (
        <AvatarPickerModal currentUser={me} others={profiles.filter((p) => p.id !== uid)} onClose={() => setAvatarOpen(false)} onSave={saveProfile} />
      )}
      {tutorialActive && (
        <TutorialOverlay steps={TUTORIAL_STEPS} onClose={dismissTutorial} />
      )}
      {scanOpen && (
        <ScannerModal resolve={resolveUpc} onClose={() => setScanOpen(false)}
          onResolved={(res) => {
            setScanOpen(false);
            // If PriceCharting named it, seed the form with its price + id so it
            // opens pre-priced (no second PriceCharting call needed at FILL).
            const tiers = res.price ? { loose: res.price.loose_cents, cib: res.price.cib_cents, new: res.price.new_cents } : null;
            setEditing({ title: res.title, upc: res.upc ?? null, pricecharting_id: res.pricecharting_id ?? null, priceTiers: tiers });
          }} />
      )}
    </div>
  );
}

/* ---------- small shared bits ---------- */
function MiniStat({ icon: Icon, label, value, color, onClick }: any) {
  const base: React.CSSProperties = { flex: 1, minWidth: 92, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "12px 14px", textAlign: "left" };
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--display)", fontSize: 20, color }}>{value}</div>
    </>
  );
  return onClick
    ? <button onClick={onClick} className="ministat" style={{ ...base, color: "var(--ink)" }}>{inner}</button>
    : <div style={base}>{inner}</div>;
}
function SectionHead({ icon: Icon, accent, children }: any) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Icon size={15} color={accent} />
      <span style={{ fontSize: 12, letterSpacing: 1.5, fontFamily: "var(--display)", fontWeight: 700 }}>{children}</span>
    </div>
  );
}

function Cover({ g, ratio = 1.32, profiles }: { g: Game; ratio?: number; profiles: Profile[] }) {
  const tint = tintFor(g.platform);
  const [err, setErr] = useState(false);
  const showArt = g.cover && !err;
  const finishers = finishersOf(g).map(([id]) => profiles.find((a) => a.id === id)).filter(Boolean) as Profile[];
  const players = playersOf(g).map(([id]) => profiles.find((a) => a.id === id)).filter(Boolean) as Profile[];
  const abandoners = abandonersOf(g).map(([id]) => profiles.find((a) => a.id === id)).filter(Boolean) as Profile[];
  return (
    <div style={{ width: "100%", aspectRatio: `1 / ${ratio}`, borderRadius: "var(--radius)", position: "relative", overflow: "hidden", border: "1px solid var(--line)", background: `linear-gradient(150deg, ${tint}33, var(--panel-alt))` }}>
      {showArt ? <img src={g.cover!} alt={g.title} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span style={{ fontFamily: "var(--display)", fontSize: 30, color: tint, opacity: .5 }}>{(g.title || "?")[0]}</span></div>}
      {g.status === "wishlist" && <div style={{ position: "absolute", top: 7, right: 7, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 99, background: "#13111ad0" }}><Heart size={12} color="var(--accent)" fill="var(--accent)" /></div>}
      {g.status === "owned" && (players.length > 0 || finishers.length > 0 || abandoners.length > 0) && (
        <div style={{ position: "absolute", top: 7, right: 7, display: "flex", gap: 4 }}>
          {players.map((u) => <span key={"p" + u.id} title={`${u.name} playing`} style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, background: "#13111aea", border: `1.5px solid ${u.color}` }}><span className="pulse" style={{ width: 7, height: 7, borderRadius: 99, background: u.color }} /></span>)}
          {finishers.map((u) => <span key={"f" + u.id} title={`${u.name} finished`} style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, background: u.color, border: "1.5px solid var(--bg)" }}><Check size={11} color="var(--bg)" strokeWidth={3.5} /></span>)}
          {abandoners.map((u) => <span key={"a" + u.id} title={`${u.name} abandoned`} style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, background: "#13111aea", border: "1.5px solid var(--bad)" }}><X size={11} color="var(--bad)" strokeWidth={3.5} /></span>)}
        </div>
      )}
    </div>
  );
}

function GameCard({ g, profiles, onClick }: { g: Game; profiles: Profile[]; onClick: () => void }) {
  const tint = tintFor(g.platform);
  return (
    <button onClick={onClick} className="game-card" style={{ display: "flex", flexDirection: "column", gap: 9, color: "var(--ink)" }}>
      <Cover g={g} ratio={1.32} profiles={profiles} />
      <div>
        <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2, height: "2.4em", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.title}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 10, fontFamily: "var(--display)", fontWeight: 700, padding: "2px 7px", borderRadius: "var(--radius)", border: `1px solid ${tint}`, color: tint, background: tint + "1a" }}>{g.platform}</span>
          <span style={{ fontSize: 11, fontFamily: "var(--display)", color: g.status === "owned" ? "var(--ink-dim)" : "var(--accent)" }}>{g.status === "owned" ? money(g.value_cents) : "♡ wishlist"}</span>
        </div>
      </div>
    </button>
  );
}

// List-mode row for the collection: compact thumbnail, then title + platform,
// with the value (or wishlist marker) trailing. Mirrors GameCard's data, laid wide.
function GameRow({ g, profiles, onClick }: { g: Game; profiles: Profile[]; onClick: () => void }) {
  const tint = tintFor(g.platform);
  const [err, setErr] = useState(false);
  const showArt = g.cover && !err;
  const finishers = finishersOf(g).map(([id]) => profiles.find((a) => a.id === id)).filter(Boolean) as Profile[];
  const players = playersOf(g).map(([id]) => profiles.find((a) => a.id === id)).filter(Boolean) as Profile[];
  const abandoners = abandonersOf(g).map(([id]) => profiles.find((a) => a.id === id)).filter(Boolean) as Profile[];
  return (
    <button onClick={onClick} className="game-card" style={{ display: "flex", alignItems: "center", gap: 13, padding: "9px 14px 9px 9px", borderRadius: "var(--radius)", background: "var(--panel)", border: "1px solid var(--line)", minWidth: 0, width: "100%", textAlign: "left", color: "var(--ink)" }}>
      <div style={{ flex: "0 0 auto", width: 42, aspectRatio: "1 / 1.32", borderRadius: 7, overflow: "hidden", position: "relative", border: "1px solid var(--line)", background: `linear-gradient(150deg, ${tint}33, var(--panel-alt))` }}>
        {showArt ? <img src={g.cover!} alt={g.title} loading="lazy" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span style={{ fontFamily: "var(--display)", fontSize: 16, color: tint, opacity: .5 }}>{(g.title || "?")[0]}</span></div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</div>
        <div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.platform}{g.year ? ` · ${g.year}` : ""}</div>
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 4 }}>
        {g.status === "wishlist" && <span title="Wishlist" style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, background: "#13111aea", border: "1.5px solid var(--accent)" }}><Heart size={11} color="var(--accent)" fill="var(--accent)" /></span>}
        {players.map((u) => <span key={"p" + u.id} title={`${u.name} playing`} style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, background: "#13111aea", border: `1.5px solid ${u.color}` }}><span className="pulse" style={{ width: 7, height: 7, borderRadius: 99, background: u.color }} /></span>)}
        {finishers.map((u) => <span key={"f" + u.id} title={`${u.name} finished`} style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, background: u.color, border: "1.5px solid var(--bg)" }}><Check size={11} color="var(--bg)" strokeWidth={3.5} /></span>)}
        {abandoners.map((u) => <span key={"a" + u.id} title={`${u.name} abandoned`} style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, background: "#13111aea", border: "1.5px solid var(--bad)" }}><X size={11} color="var(--bad)" strokeWidth={3.5} /></span>)}
      </div>
    </button>
  );
}

function FilterField({ label, value, onChange, options, compact, disabled }: { label?: string; value: string; onChange: (v: string) => void; options: [string, string][]; compact?: boolean; disabled?: boolean }) {
  const current = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <label style={{ position: "relative", display: "flex", flexDirection: "column", gap: compact ? 0 : 4, cursor: disabled ? "not-allowed" : "pointer", minWidth: 0, opacity: disabled ? .45 : 1 }}>
      {label && <span style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, paddingLeft: 2 }}>{label.toUpperCase()}</span>}
      <div style={{ position: "relative", display: "flex", alignItems: "center", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", boxSizing: "border-box", height: compact ? 38 : undefined, padding: compact ? "0 30px 0 12px" : "10px 30px 10px 13px" }}>
        <span style={{ fontSize: compact ? 12 : 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: compact ? "var(--display)" : "var(--body)" }}>{current}</span>
        <ChevronDown size={15} color="var(--ink-dim)" style={{ position: "absolute", right: 10, pointerEvents: "none" }} />
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: disabled ? "not-allowed" : "pointer", border: "none", appearance: "none" }}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </label>
  );
}

function TopBar({ floating, currentUser, userMenu, setUserMenu, onScan, onSettings, onChooseAvatar, onHome, onAdd }: any) {
  const glass = floating
    ? { background: "rgba(20,17,26,0.34)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(10px)" as const }
    : { background: "var(--panel)", border: "1px solid var(--line)" };
  const iconBtn: React.CSSProperties = { display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 99, cursor: "pointer", color: floating ? "#fff" : "var(--ink)", ...glass };
  const myAvatar = avatarSrc(currentUser.avatar);
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: floating ? "calc(16px + env(safe-area-inset-top)) 16px 14px" : "calc(16px + env(safe-area-inset-top)) 0 16px", position: "relative" }}>
      <button onClick={onHome} aria-label="Go to dashboard" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--display)", fontSize: 19, letterSpacing: 1.5, fontWeight: 700, color: floating ? "#fff" : "var(--ink)", textShadow: floating ? "0 2px 12px rgba(0,0,0,0.5)" : "none" }}>GAMEVAULT</button>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button data-tut="scan" onClick={onScan} aria-label="Scan" style={iconBtn}><ScanLine size={18} /></button>
        <button data-tut="settings" onClick={onSettings} aria-label="Settings" style={iconBtn}><Settings size={18} /></button>
        <button data-tut="add" onClick={onAdd} aria-label="Add" style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 99, border: "none", cursor: "pointer", background: "var(--accent2)", color: "var(--bg)" }}><Plus size={19} strokeWidth={3} /></button>
        <div style={{ position: "relative" }} data-tut="account">
          <button onClick={() => setUserMenu((o: boolean) => !o)} aria-label="Account"
            style={myAvatar
              ? { display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 99, cursor: "pointer", border: "none", background: "none", padding: 0 }
              : { display: "grid", placeItems: "center", border: `2px solid ${currentUser.color}`, background: floating ? "rgba(20,17,26,0.4)" : currentUser.color + "22", width: 38, height: 38, borderRadius: 99, cursor: "pointer", color: floating ? "#fff" : "var(--ink)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 14 }}>
            {myAvatar ? <Avatar user={currentUser} size={38} /> : currentUser.name[0].toUpperCase()}
          </button>
          {userMenu && (
            <>
              <div onClick={() => setUserMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", right: 0, top: 46, zIndex: 41, minWidth: 196, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 8, boxShadow: "0 12px 32px -10px #000" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 10px", borderBottom: "1px solid var(--line)", marginBottom: 6 }}>
                  <Avatar user={currentUser} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 2 }}>Signed in</div>
                  </div>
                </div>
                <button onClick={() => { setUserMenu(false); onChooseAvatar(); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", background: "none", border: "none", cursor: "pointer", color: "var(--ink)", borderRadius: 8, fontSize: 13, textAlign: "left" }}>
                  <ImageIcon size={15} /> Avatar &amp; colour
                </button>
                <form action="/api/signout" method="post">
                  <button type="submit" style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", background: "none", border: "none", cursor: "pointer", color: "var(--ink)", borderRadius: 8, fontSize: 13, textAlign: "left" }}>
                    <LogOut size={15} /> Log out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ImmersiveHero({ slides, userById, currentUser, onOpen }: { slides: { g: Game; pid: string; hours: number }[]; userById: (id?: string | null) => Profile | null; currentUser: Profile; onOpen: (g: Game) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  const onScroll = () => { const el = trackRef.current; if (el) { const i = Math.round(el.scrollLeft / el.clientWidth); if (i !== idx) setIdx(i); } };
  const goTo = (i: number) => trackRef.current?.scrollTo({ left: i * trackRef.current.clientWidth, behavior: "smooth" });
  const onPointerDown = (e: React.PointerEvent) => { if (e.pointerType !== "mouse") return; const el = trackRef.current; if (!el) return; drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false }; el.setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => { if (!drag.current.active) return; const el = trackRef.current; if (!el) return; const dx = e.clientX - drag.current.startX; if (Math.abs(dx) > 4) drag.current.moved = true; el.scrollLeft = drag.current.startScroll - dx; };
  const endDrag = () => { if (!drag.current.active) return; const el = trackRef.current; drag.current.active = false; if (el) { const i = Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / el.clientWidth))); el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); } setTimeout(() => { drag.current.moved = false; }, 0); };
  const openGuarded = (g: Game) => { if (!drag.current.moved) onOpen(g); };

  if (!slides.length) {
    return (
      <div style={{ height: "62vh", minHeight: 440, display: "grid", placeItems: "center", background: "radial-gradient(120% 90% at 50% 0%, #e0738a1c, var(--bg))", borderBottom: "1px solid var(--line)" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <Gamepad2 size={34} color="var(--ink-dim)" style={{ opacity: .6, margin: "0 auto" }} />
          <div style={{ fontFamily: "var(--display)", fontSize: 18, marginTop: 16 }}>Nothing in play</div>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 8, maxWidth: 260, lineHeight: 1.5 }}>Set one of your games to <span style={{ color: "var(--accent2)" }}>Playing</span> and it&apos;ll headline here.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "81vh", minHeight: 520, maxHeight: 820 }}>
      <div ref={trackRef} onScroll={onScroll} className="hero-track" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ cursor: slides.length > 1 ? "grab" : "default" }}>
        {slides.map((s) => <HeroSlide key={s.g.id + ":" + s.pid} g={s.g} hours={s.hours} player={userById(s.pid)} currentUser={currentUser} onOpen={openGuarded} />)}
      </div>
      {slides.length > 1 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 18, display: "flex", justifyContent: "center", gap: 9, zIndex: 12 }}>
          {slides.map((s, i) => { const c = userById(s.pid)?.color || "var(--accent2)"; const on = i === idx; return <button key={s.g.id + ":" + s.pid} onClick={() => goTo(i)} aria-label={`Slide ${i + 1}`} style={{ width: on ? 26 : 9, height: 9, borderRadius: 99, border: "none", cursor: "pointer", padding: 0, background: on ? c : "rgba(255,255,255,0.4)", transition: "all .3s" }} />; })}
        </div>
      )}
    </div>
  );
}

function HeroSlide({ g, hours, player, currentUser, onOpen }: { g: Game; hours: number; player: Profile | null; currentUser: Profile; onOpen: (g: Game) => void }) {
  const [err, setErr] = useState(false);
  const tint = tintFor(g.platform);
  const showArt = g.cover && !err;
  const isMine = player && player.id === currentUser.id;
  const target = g.hltb?.main || null;
  const pct = target ? Math.min(100, Math.round((hours / target) * 100)) : null;
  return (
    <div className="hero-slide">
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {showArt ? <img src={g.cover!} alt="" aria-hidden style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.25)", filter: "blur(10px) saturate(1.2) brightness(.6)" }} /> : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${tint}55, var(--bg))` }} />}
      </div>
      <div onClick={() => onOpen(g)} role="button" aria-label={`Open ${g.title}`} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "12% 24px 52%", cursor: "pointer" }}>
        {showArt ? <img src={g.cover!} alt={g.title} onError={() => setErr(true)} style={{ width: "auto", height: "auto", maxWidth: "min(64%, 340px)", maxHeight: "100%", objectFit: "contain", borderRadius: 16, border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)" }} /> : <span style={{ fontFamily: "var(--display)", fontSize: 96, color: tint, opacity: .5 }}>{(g.title || "?")[0]}</span>}
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(to top, #13111a 0%, rgba(19,17,26,0.82) 34%, rgba(19,17,26,0.12) 64%, rgba(19,17,26,0.28) 100%)" }} />
      <button onClick={() => onOpen(g)} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 20px 54px", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#fff", width: "100%" }}>
        {player && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "5px 13px 5px 5px", borderRadius: 99, background: player.color + "26", border: `1px solid ${player.color}` }}>
            <Avatar user={player} size={22} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", fontFamily: "var(--display)" }}>{isMine ? "You're playing" : `${player.name} is playing`}</span>
          </div>
        )}
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, letterSpacing: -0.5, textShadow: "0 2px 20px rgba(0,0,0,0.6)", maxWidth: 560 }}>{g.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.82)", fontFamily: "var(--display)", flexWrap: "nowrap", maxWidth: "100%" }}>
          <span style={{ flexShrink: 0, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.14)", fontWeight: 700 }}>{g.platform}</span>
          {g.publisher && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.publisher}</span>}
          {g.year && <span style={{ flexShrink: 0, opacity: .7 }}>· {g.year}</span>}
        </div>
        <div style={{ marginTop: 20, maxWidth: 460 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--display)", fontSize: 17, color: "#fff" }}>{hours}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>h played</span></span>
            {target && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--display)" }}>{pct}% · ~{target}h to beat</span>}
          </div>
          {target && <div style={{ height: 9, background: "rgba(255,255,255,0.18)", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: player?.color || "var(--accent2)", borderRadius: 99 }} /></div>}
        </div>
      </button>
    </div>
  );
}

// Prev/next arrows overlaid on the screenshot lightbox; faded out at the ends.
const shotNavBtn = (side: "left" | "right", disabled: boolean): React.CSSProperties => ({
  position: "absolute", top: "50%", [side]: 10, transform: "translateY(-50%)",
  display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 99,
  background: "#000000a6", border: "1px solid rgba(255,255,255,0.15)", color: "#fff",
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.25 : 1, padding: 0,
  backdropFilter: "blur(4px)", transition: "opacity .2s ease",
});

// IGDB screenshots (t_screenshot_big, 16:9) shown in the detail view as a swipeable
// slider. Each image drops out on its own load error so a stale URL never leaves a
// broken tile. Mirrors the hero slider: scroll-snap track, dots, mouse-drag.
function Screenshots({ shots }: { shots?: string[] | null }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  // Number of reachable snap positions (dots). With ~2.5 shots per view the last
  // image can't left-align (the viewport clamps the scroll first), so this is
  // fewer than the image count — measured from the actual layout below.
  const [pages, setPages] = useState(1);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  // Position within `list` of the screenshot opened full-size in the lightbox, or
  // null when closed. Tracking the index (not just the URL) lets us page to the
  // previous/next live screenshot from inside the lightbox.
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  const all = (shots ?? []).filter((s) => typeof s === "string" && s.trim());
  // Keep stable indices for onError tracking, but only render the live ones.
  const list = all.map((src, i) => ({ src, i })).filter(({ i }) => !broken[i]);

  // Snap step is one image's width + the inter-image gap (measured from the first
  // two slides), not the viewport — we show ~2.5 shots per view.
  const stepPx = () => { const el = trackRef.current; if (!el) return 1; const c = el.children; if (c.length >= 2) return (c[1] as HTMLElement).offsetLeft - (c[0] as HTMLElement).offsetLeft; return (c[0] as HTMLElement)?.clientWidth || el.clientWidth; };
  // Reachable positions = the clamped end scroll mapped to a step count, +1. So the
  // last dot corresponds to "scrolled to the end" even though the final image never
  // reaches the left edge. Recomputed on mount, resize, and when the list changes.
  const recompute = () => { const el = trackRef.current; if (!el) return; const max = el.scrollWidth - el.clientWidth; const p = max <= 1 ? 1 : Math.round(max / stepPx()) + 1; setPages(p); setIdx((i) => Math.min(i, p - 1)); };
  const clamp = (el: HTMLDivElement) => Math.max(0, Math.min(pages - 1, Math.round(el.scrollLeft / stepPx())));
  const onScroll = () => { const el = trackRef.current; if (el) { const i = clamp(el); if (i !== idx) setIdx(i); } };
  const goTo = (i: number) => trackRef.current?.scrollTo({ left: i * stepPx(), behavior: "smooth" });
  const onPointerDown = (e: React.PointerEvent) => { if (e.pointerType !== "mouse") return; const el = trackRef.current; if (!el) return; drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false }; el.setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => { if (!drag.current.active) return; const el = trackRef.current; if (!el) return; if (Math.abs(e.clientX - drag.current.startX) > 4) drag.current.moved = true; el.scrollLeft = drag.current.startScroll - (e.clientX - drag.current.startX); };
  const endDrag = () => { if (!drag.current.active) return; const el = trackRef.current; drag.current.active = false; if (el) goTo(clamp(el)); };
  // A mouse-drag to scroll also fires a click; only open the lightbox on a clean
  // tap/click. We store the list position; the big URL is derived on render.
  const open = (pos: number) => { if (!drag.current.moved) setZoomIdx(pos); };
  // Step to the previous/next live screenshot, clamped at the ends.
  const navZoom = (d: number) => setZoomIdx((z) => z == null ? z : Math.max(0, Math.min(list.length - 1, z + d)));

  useEffect(() => {
    recompute();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  // Arrow keys page through the lightbox; Escape closes it.
  useEffect(() => {
    if (zoomIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomIdx(null);
      else if (e.key === "ArrowRight") navZoom(1);
      else if (e.key === "ArrowLeft") navZoom(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomIdx, list.length]);

  if (!list.length) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 8 }}>SCREENSHOTS</div>
      <div ref={trackRef} onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        className="shot-track" style={{ cursor: pages > 1 ? "grab" : "default" }}>
        {list.map(({ src, i }, pos) => (
          <div key={i} className="shot-slide" onClick={() => open(pos)} style={{ cursor: "zoom-in" }}>
            <img src={src} alt="" loading="lazy" onLoad={recompute} onError={() => setBroken((b) => ({ ...b, [i]: true }))}
              style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block", borderRadius: "var(--radius)", border: "1px solid var(--line)" }} />
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
          {Array.from({ length: pages }, (_, i) => { const on = i === idx; return <button key={i} onClick={() => goTo(i)} aria-label={`Screenshot ${i + 1}`} style={{ width: on ? 22 : 8, height: 8, borderRadius: 99, border: "none", cursor: "pointer", padding: 0, background: on ? "var(--accent)" : "var(--line)", transition: "all .3s" }} />; })}
        </div>
      )}
      {zoomIdx !== null && list[zoomIdx] && (
        <div onClick={() => setZoomIdx(null)} className="fade" style={{ position: "fixed", inset: 0, zIndex: 90, background: "#000c", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 640, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 20, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "2px 4px" }}>
              <div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>SCREENSHOT{list.length > 1 ? ` ${zoomIdx + 1} / ${list.length}` : ""}</div>
              <button onClick={() => setZoomIdx(null)} aria-label="Close" style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
            </div>
            <div style={{ position: "relative" }}>
              <img src={list[zoomIdx].src.replace("t_screenshot_big", "t_1080p")} alt="" style={{ width: "100%", maxHeight: "78vh", objectFit: "contain", display: "block", borderRadius: "var(--radius)" }} />
              {list.length > 1 && (
                <>
                  <button onClick={() => navZoom(-1)} disabled={zoomIdx === 0} aria-label="Previous screenshot" style={shotNavBtn("left", zoomIdx === 0)}><ChevronLeft size={22} /></button>
                  <button onClick={() => navZoom(1)} disabled={zoomIdx === list.length - 1} aria-label="Next screenshot" style={shotNavBtn("right", zoomIdx === list.length - 1)}><ChevronRight size={22} /></button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Quick play-status actions on the detail sheet for a game you own. Not playing
// → a one-tap "start playing" (a fresh replay when the saved run is finished,
// resume when abandoned). Playing → nudge your hours so the progress bar moves,
// or finish/abandon the run. Everything writes through the same saveGame path as
// the editor, so replay archiving stays consistent.
function ProgressActions({ g, currentUser, onProgress }: { g: Game; currentUser: Profile; onProgress: (status: PlayStatus, hours: number) => Promise<void> }) {
  const myProg = getProg(g, currentUser.id);
  const [hours, setHours] = useState<number>(myProg.hours);
  const [busy, setBusy] = useState(false);
  // Re-sync the editable value whenever the saved hours change (after our own
  // save + reload, or a partner editing on another device).
  useEffect(() => { setHours(myProg.hours); }, [myProg.hours]);

  const run = async (status: PlayStatus, h: number) => {
    setBusy(true);
    try { await onProgress(status, Math.max(0, Math.round(h))); } finally { setBusy(false); }
  };

  if (myProg.status !== "playing") {
    const label = myProg.status === "finished" ? "PLAY AGAIN" : myProg.status === "abandoned" ? "RESUME PLAYING" : "START PLAYING";
    // A replay starts a fresh session at 0h (saveGame archives the finished run);
    // resuming an abandoned run keeps its hours.
    const startHours = myProg.status === "finished" ? 0 : myProg.hours;
    return (
      <button onClick={() => run("playing", startHours)} disabled={busy} style={{ marginTop: 18, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 0", border: "none", borderRadius: "var(--radius)", cursor: busy ? "default" : "pointer", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13, opacity: busy ? 0.6 : 1 }}>
        {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />} {label}
      </button>
    );
  }

  const target = g.hltb?.main || null;
  const pct = target ? Math.min(100, Math.round((hours / target) * 100)) : null;
  const dirty = hours !== myProg.hours;
  const stepBtn: React.CSSProperties = { display: "grid", placeItems: "center", width: 38, height: 38, flexShrink: 0, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "var(--ink)", padding: 0 };

  return (
    <div style={{ marginTop: 18, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>YOUR PROGRESS</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, fontFamily: "var(--display)", color: "var(--accent2)" }}>
          <span className="pulse" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--accent2)" }} /> PLAYING
        </span>
      </div>

      {target && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, background: "var(--panel)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--line)" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: currentUser.color, borderRadius: 99, transition: "width .2s" }} />
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 6 }}>{hours}h / {target}h main story · {pct}%</div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setHours((h) => Math.max(0, h - 1))} disabled={busy || hours <= 0} style={{ ...stepBtn, cursor: busy || hours <= 0 ? "default" : "pointer", opacity: busy || hours <= 0 ? 0.5 : 1 }}><Minus size={16} /></button>
        <input type="number" min={0} value={hours} onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))} style={{ flex: 1, minWidth: 0, textAlign: "center", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "var(--ink)", padding: "10px 12px", fontSize: 15, fontFamily: "var(--display)", fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
        <button onClick={() => setHours((h) => h + 1)} disabled={busy} style={{ ...stepBtn, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}><Plus size={16} /></button>
        <button onClick={() => run("playing", hours)} disabled={busy || !dirty} style={{ flexShrink: 0, padding: "0 16px", height: 38, borderRadius: "var(--radius)", cursor: busy || !dirty ? "default" : "pointer", background: dirty ? "var(--accent2)" : "var(--panel)", color: dirty ? "var(--bg)" : "var(--ink-dim)", border: dirty ? "none" : "1px solid var(--line)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12 }}>{busy ? <Loader2 size={14} className="spin" /> : "UPDATE"}</button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => run("finished", hours)} disabled={busy} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 0", border: "1px solid var(--good)", borderRadius: "var(--radius)", cursor: busy ? "default" : "pointer", background: "var(--good)1a", color: "var(--good)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12, opacity: busy ? 0.6 : 1 }}><Check size={15} strokeWidth={3} /> FINISH</button>
        <button onClick={() => run("abandoned", hours)} disabled={busy} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 0", border: "1px solid var(--bad)", borderRadius: "var(--radius)", cursor: busy ? "default" : "pointer", background: "var(--bad)1a", color: "var(--bad)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12, opacity: busy ? 0.6 : 1 }}><X size={15} strokeWidth={3} /> ABANDON</button>
      </div>
    </div>
  );
}

function DetailView({ game, userById, currentUser, onProgress, onClose, onEdit, onSetValue }: { game: Game; userById: (id?: string | null) => Profile | null; currentUser: Profile; onProgress: (status: PlayStatus, hours: number) => Promise<void>; onClose: () => void; onEdit: () => void; onSetValue: (cents: number) => Promise<void> }) {
  useBodyScrollLock();
  const g = game;
  const tint = tintFor(g.platform);
  const addedByUser = userById(g.added_by);
  // Inline quick-edit for the market value. `valDraft` holds the euro string
  // while editing (null = not editing); the displayed/stored value is in cents.
  const [valDraft, setValDraft] = useState<string | null>(null);
  const [savingVal, setSavingVal] = useState(false);
  const saveVal = async () => {
    if (savingVal || valDraft === null) return;
    setSavingVal(true);
    try { await onSetValue(Math.max(0, Math.round((Number(valDraft) || 0) * 100))); setValDraft(null); }
    finally { setSavingVal(false); }
  };
  const facts: [string, any][] = [["Developer", g.developer || "—"], ["Publisher", g.publisher || "—"], ["Released", g.year || "—"], ["Genre", g.genre || "—"], ["Condition", conditionLabel(g.condition) || "—"], ["Region", g.region || "—"]];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }} className="sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel)", borderBottom: "1px solid var(--line)" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontFamily: "var(--display)", fontSize: 12, fontWeight: 700 }}><ChevronLeft size={17} /> BACK</button>
          <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontFamily: "var(--display)", fontSize: 12, fontWeight: 700 }}><Pencil size={14} /> EDIT</button>
        </div>
        <div style={{ padding: "20px 20px calc(20px + env(safe-area-inset-bottom))", overflowY: "auto", overflowX: "hidden", flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", gap: 18 }}>
            <div style={{ width: 130, flexShrink: 0 }}><Cover g={g} ratio={1.33} profiles={[]} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 10, fontFamily: "var(--display)", fontWeight: 700, padding: "3px 9px", borderRadius: "var(--radius)", border: `1px solid ${tint}`, color: tint, background: tint + "1a" }}>{g.platform}</span>
              <h1 style={{ fontFamily: "var(--display)", fontSize: 22, lineHeight: 1.18, margin: "11px 0 0", fontWeight: 800 }}>{g.title}</h1>
              {(g.developer || g.publisher) && <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 8 }}>{g.developer}{g.developer && g.publisher && g.developer !== g.publisher ? " · " : ""}{g.publisher !== g.developer ? g.publisher : ""}</div>}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, marginTop: 12 }}>
                {g.rating != null && <StarRating value={g.rating} size={17} />}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, lineHeight: 1, fontFamily: "var(--display)", color: g.status === "owned" ? "var(--good)" : "var(--accent)" }}>{g.status === "owned" ? <><Box size={13} /> IN COLLECTION</> : <><Heart size={13} /> WISHLIST</>}</span>
              </div>
            </div>
          </div>

          {g.status === "owned" && <ProgressActions g={g} currentUser={currentUser} onProgress={onProgress} />}

          {g.description && <div style={{ marginTop: 20 }}><div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 7 }}>ABOUT</div><p style={{ fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>{g.description}</p></div>}

          <Screenshots shots={g.screenshots} />

          {g.status === "owned" && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 8 }}>WHO&apos;S PLAYED IT</div>
              <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                {(() => {
                  const rows = progressEntries(g).map(([id, p]) => ({ u: userById(id), p, runs: g.playthroughs?.[id] ?? [] }))
                    .filter((r) => r.u && (!isUnplayed(r.p.status) || r.runs.length))
                    .sort((a, b) => (a.p.status === "playing" ? 0 : 1) - (b.p.status === "playing" ? 0 : 1));
                  if (!rows.length) return <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--ink-dim)" }}>Nobody&apos;s started this yet.</div>;
                  return rows.map(({ u, p, runs }, i) => {
                    const target = g.hltb?.main || null;
                    const pct = target ? Math.min(100, Math.round((p.hours / target) * 100)) : null;
                    // Full completion history = archived runs + the current run if it's finished.
                    const history = [
                      ...runs.map((r) => ({ key: r.id, hours: r.hours, finished_at: r.finished_at })),
                      ...(p.status === "finished" ? [{ key: "current", hours: p.hours, finished_at: p.updated_at }] : []),
                    ];
                    return (
                      <div key={u!.id} style={{ padding: "13px 16px", borderTop: i ? "1px solid var(--line)" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar user={u!} size={26} />
                          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{u!.name}</div></div>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, fontFamily: "var(--display)", color: playColor(p.status) }}>
                            {p.status === "playing" && <span className="pulse" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--accent2)" }} />}
                            {p.status === "finished" && <Check size={13} strokeWidth={3} />}
                            {p.status === "abandoned" && <X size={13} strokeWidth={3} />}
                            {PLAY_STATUS[p.status].short}
                          </span>
                          <span style={{ fontFamily: "var(--display)", fontSize: 13, marginLeft: 4 }}>{p.hours}h</span>
                        </div>
                        {target && p.status === "playing" && <div style={{ marginTop: 10 }}><div style={{ height: 6, background: "var(--panel)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--line)" }}><div style={{ height: "100%", width: `${pct}%`, background: u!.color, borderRadius: 99 }} /></div></div>}
                        {history.length > 0 && (
                          <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
                            <div style={{ fontSize: 8.5, letterSpacing: 1.2, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 6 }}>
                              PLAYTHROUGHS · {history.length}{p.status === "playing" && runs.length > 0 ? " + REPLAYING" : ""}
                            </div>
                            {history.map((r, idx) => (
                              <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 11.5, padding: "3px 0", color: "var(--ink-dim)", fontFamily: "var(--display)" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                                  <Check size={11} strokeWidth={3} color="var(--good)" /> Run {idx + 1} · {r.hours}h
                                </span>
                                <span>{fmtDate(r.finished_at)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {g.hltb && (g.hltb.main || g.hltb.extra || g.hltb.complete) && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><Clock size={13} color="var(--accent3)" /><span style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>HOW LONG TO BEAT</span></div>
              <div style={{ display: "flex", gap: 10 }}>
                {([["MAIN", g.hltb.main], ["MAIN + EXTRA", g.hltb.extra], ["100%", g.hltb.complete]] as [string, number | null][]).map(([l, h]) => (
                  <div key={l} style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "11px 12px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--display)", fontSize: 15, color: h ? "var(--ink)" : "var(--ink-dim)" }}>{h ? `${h}h` : "—"}</div>
                    <div style={{ fontSize: 8.5, letterSpacing: 1, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 6 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginTop: 20, background: "var(--line)", border: "1px solid var(--line)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            {facts.map(([k, v]) => <div key={k} style={{ background: "var(--panel)", padding: "12px 14px" }}><div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{k.toUpperCase()}</div><div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{v}</div></div>)}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <div style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "11px 13px" }}>
              {valDraft === null ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>MARKET VALUE</div>
                    <div style={{ fontSize: 16, fontWeight: 800, marginTop: 5, fontFamily: "var(--display)" }}>{money(g.value_cents)}</div>
                  </div>
                  <button onClick={() => setValDraft(g.value_cents ? String(Math.round(g.value_cents / 100)) : "")} aria-label="Edit market value"
                    style={{ display: "grid", placeItems: "center", width: 24, height: 24, flexShrink: 0, borderRadius: 7, background: "var(--panel)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink-dim)" }}>
                    <Pencil size={12} />
                  </button>
                </div>
              ) : (
                <>
                <div style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>MARKET VALUE</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "0 10px" }}>
                    <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--display)", color: "var(--ink-dim)" }}>€</span>
                    <input autoFocus type="number" min={0} inputMode="numeric" value={valDraft}
                      onChange={(e) => setValDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveVal(); if (e.key === "Escape") setValDraft(null); }}
                      style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", color: "var(--ink)", fontSize: 15, fontWeight: 800, fontFamily: "var(--display)", padding: "9px 6px" }} />
                  </div>
                  <button onClick={saveVal} disabled={savingVal} aria-label="Save value"
                    style={{ display: "grid", placeItems: "center", width: 34, height: 34, flexShrink: 0, borderRadius: "var(--radius)", background: "var(--good)", border: "none", cursor: savingVal ? "default" : "pointer", color: "var(--bg)", opacity: savingVal ? 0.6 : 1 }}>
                    {savingVal ? <Loader2 size={15} className="spin" /> : <Check size={16} strokeWidth={3} />}
                  </button>
                  <button onClick={() => setValDraft(null)} disabled={savingVal} aria-label="Cancel"
                    style={{ display: "grid", placeItems: "center", width: 34, height: 34, flexShrink: 0, borderRadius: "var(--radius)", background: "var(--panel)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink-dim)" }}>
                    <X size={16} strokeWidth={3} />
                  </button>
                </div>
                </>
              )}
            </div>
          </div>

          {addedByUser && <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 9 }}><Avatar user={addedByUser} size={22} /><span style={{ fontSize: 12, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>Added by {addedByUser.name}</span></div>}
        </div>
      </div>
    </div>
  );
}

// Detail modal for an unreleased IGDB game from the Upcoming view. A trimmed
// Shared shape for the best-effort IGDB enrichment, and the wishlist-add payload
// builder — used by both the detail modal and the Upcoming card's quick-add so
// the two stay identical (first listed platform, status wishlist, same fields).
type UpcomingMeta = { developer?: string; publisher?: string; description?: string; screenshots?: string[]; rating?: number | null } | null;
function upcomingWishlistPayload(g: UpcomingGame, meta: UpcomingMeta): Partial<Game> {
  const platforms = igdbPlatformsToApp(g.platforms);
  return {
    title: g.title,
    platform: platforms[0] ?? g.platforms[0] ?? "—",
    platforms,
    status: "wishlist",
    cover: g.cover || null,
    genre: g.genre || null,
    // Event-announced games can lack a date (releaseDate 0) — leave year null then.
    year: g.releaseDate ? new Date(g.releaseDate * 1000).getFullYear() : null,
    igdb_id: g.igdbId,
    developer: meta?.developer || null,
    publisher: meta?.publisher || null,
    description: meta?.description || null,
    screenshots: meta?.screenshots?.length ? meta.screenshots : undefined,
    rating: meta?.rating ?? null,
  };
}

// DetailView: no players/HLTB/value/condition — just developer, publisher, genre,
// the release date, and a one-tap "add to wishlist". Developer/publisher (plus a
// blurb + screenshots) aren't in the upcoming feed, so they're enriched on open
// via the same IGDB lookup the add/edit FILL uses; best-effort.
function UpcomingDetail({ g, existingStatus, onClose, onAdd }: {
  g: UpcomingGame;
  existingStatus: "owned" | "wishlist" | null;
  onClose: () => void;
  onAdd: (payload: Partial<Game> & { myStatus?: PlayStatus }) => Promise<void>;
}) {
  useBodyScrollLock();
  const [meta, setMeta] = useState<{ developer: string; publisher: string; description: string; screenshots: string[]; rating: number | null } | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    setMeta(null);
    setMetaLoading(true);
    fetch("/api/metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: g.title }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (active && m) setMeta({ developer: m.developer || "", publisher: m.publisher || "", description: m.description || "", screenshots: Array.isArray(m.screenshots) ? m.screenshots : [], rating: m.rating ?? null }); })
      .catch(() => {})
      .finally(() => { if (active) setMetaLoading(false); });
    return () => { active = false; };
  }, [g.title]);

  const released = new Date(g.releaseDate * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const dim = (v: string) => (metaLoading ? "…" : v || "—");
  const facts: [string, string][] = [
    ["Developer", dim(meta?.developer ?? "")],
    ["Publisher", dim(meta?.publisher ?? "")],
    ["Released", released],
    ["Genre", g.genre || "—"],
  ];

  const handleAdd = async () => {
    setAdding(true);
    await onAdd(upcomingWishlistPayload(g, meta));
    setAdding(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }} className="sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel)", borderBottom: "1px solid var(--line)" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontFamily: "var(--display)", fontSize: 12, fontWeight: 700 }}><ChevronLeft size={17} /> BACK</button>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, fontFamily: "var(--display)", color: "var(--accent3)" }}><CalendarClock size={13} /> UPCOMING</span>
        </div>
        <div style={{ padding: "20px 20px calc(20px + env(safe-area-inset-bottom))", overflowY: "auto", overflowX: "hidden", flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", gap: 18 }}>
            <div style={{ width: 130, flexShrink: 0 }}><UpcomingCover g={g} ratio={1.33} wishlisted={existingStatus === "wishlist"} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {g.platforms.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {g.platforms.map((p) => { const t = tintFor(p); return <span key={p} style={{ fontSize: 10, fontFamily: "var(--display)", fontWeight: 700, padding: "3px 9px", borderRadius: "var(--radius)", border: `1px solid ${t}`, color: t, background: t + "1a" }}>{p}</span>; })}
                </div>
              )}
              <h1 style={{ fontFamily: "var(--display)", fontSize: 22, lineHeight: 1.18, margin: "11px 0 0", fontWeight: 800 }}>{g.title}</h1>
              {(meta?.developer || meta?.publisher) && <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 8 }}>{meta.developer}{meta.developer && meta.publisher && meta.developer !== meta.publisher ? " · " : ""}{meta.publisher !== meta.developer ? meta.publisher : ""}</div>}
              {meta?.rating != null && <div style={{ marginTop: 12 }}><StarRating value={meta.rating} size={17} /></div>}
            </div>
          </div>

          {(meta?.description || metaLoading) && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 7 }}>ABOUT</div>
              {meta?.description
                ? <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>{meta.description}</p>
                : <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{[92, 100, 70].map((w) => <div key={w} className="skeleton" style={{ height: 11, borderRadius: 6, width: `${w}%` }} />)}</div>}
            </div>
          )}

          <Screenshots shots={meta?.screenshots} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginTop: 20, background: "var(--line)", border: "1px solid var(--line)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            {facts.map(([k, v]) => <div key={k} style={{ background: "var(--panel)", padding: "12px 14px" }}><div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{k.toUpperCase()}</div><div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{v}</div></div>)}
          </div>

          <div style={{ marginTop: 20 }}>
            {existingStatus === "wishlist" ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px", borderRadius: "var(--radius)", background: "var(--bg)", border: "1px solid var(--accent)", color: "var(--accent)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13 }}>
                <Heart size={15} fill="var(--accent)" /> ON YOUR WISHLIST
              </div>
            ) : existingStatus === "owned" ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px", borderRadius: "var(--radius)", background: "var(--bg)", border: "1px solid var(--good)", color: "var(--good)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13 }}>
                <Box size={15} /> IN YOUR COLLECTION
              </div>
            ) : (
              <button onClick={handleAdd} disabled={adding} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px", borderRadius: "var(--radius)", background: "var(--accent)", border: "none", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13, cursor: adding ? "default" : "pointer", opacity: adding ? 0.7 : 1 }}>
                {adding ? <Loader2 size={15} className="spin" /> : <Heart size={15} fill="var(--bg)" />} ADD TO WISHLIST
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Rating shown as 0–5 stars in half-star steps. Stored on the 0–100 scale the DB
// and IGDB use (half-star = 10 points), so star = rating/20. With `onChange` it's
// an input (each star has a left-half = ½ and right-half = full tap zone, click
// the current value to clear); without it, a read-only display.
function StarRating({ value, onChange, size = 26 }: { value: number | null; onChange?: (rating: number | null) => void; size?: number }) {
  const stars = value == null ? 0 : Math.round(value / 10) / 2;
  const color = "var(--accent3)";
  const pick = (s: number) => onChange?.(s === stars ? null : s * 20);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fillPct = stars >= i ? 100 : stars >= i - 0.5 ? 50 : 0;
        return (
          <span key={i} style={{ position: "relative", width: size, height: size, display: "inline-block", lineHeight: 0 }}>
            <Star size={size} color={color} fill="none" strokeWidth={1.5} style={{ position: "absolute", inset: 0 }} />
            {fillPct > 0 && (
              <span style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${fillPct}%`, overflow: "hidden", lineHeight: 0 }}>
                <Star size={size} color={color} fill={color} strokeWidth={1.5} />
              </span>
            )}
            {onChange && (
              <>
                <button type="button" aria-label={`${i - 0.5} stars`} onClick={() => pick(i - 0.5)} style={{ position: "absolute", left: 0, top: 0, width: "50%", height: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, zIndex: 1 }} />
                <button type="button" aria-label={`${i} stars`} onClick={() => pick(i)} style={{ position: "absolute", right: 0, top: 0, width: "50%", height: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, zIndex: 1 }} />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

function GameModal({ game, currentUser, genres, priceEnabled, onSave, onDelete, onClose }: { game: GameSeed; currentUser: Profile; genres: string[]; priceEnabled: boolean; onSave: (g: any) => void; onDelete: (id: string) => void; onClose: () => void }) {
  useBodyScrollLock();
  const isNew = !game.id;
  const myProg = getProg(game as Game, currentUser.id);
  // A scan can seed price tiers; derive the initial value from the tier matching
  // the starting condition, otherwise from any existing value_cents.
  const seedCondition = game.condition || "CIB";
  const seedValueEur = game.priceTiers
    ? Math.round((tierForCondition(game.priceTiers, seedCondition) ?? 0) / 100) || ""
    : game.value_cents ? Math.round(game.value_cents / 100) : "";
  const [f, setF] = useState<any>({
    title: game.title || "", platform: game.platform || PLATFORMS[0] || "PS1", status: game.status || "owned",
    condition: seedCondition, region: game.region || "PAL", genre: game.genre || genres[0] || "RPG",
    value_eur: seedValueEur,
    cover: game.cover || "", year: game.year || "", release_ts: (game as any).release_ts ?? null,
    developer: game.developer || "", publisher: game.publisher || "", description: game.description || "",
    rating: game.rating ?? null, screenshots: game.screenshots || [], hltb: game.hltb || null,
    igdb_id: game.igdb_id ?? null, pricecharting_id: game.pricecharting_id ?? null, upc: game.upc ?? null, id: game.id,
    myStatus: myProg.status, myHours: myProg.hours ?? "",
  });
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "empty">("idle");
  // EUR-cent tiers from the scan or the last FILL + the matched product name. Held
  // so a later condition change re-prices without another API call, and so we can
  // show what PriceCharting matched. Seeded from a scan when present.
  const [priceTiers, setPriceTiers] = useState<PriceTiers | null>(game.priceTiers ?? null);
  const [pricedName, setPricedName] = useState<string>(game.priceTiers ? (game.title || "") : "");
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  // A game that isn't out yet can't be owned — only wishlisted. We prefer IGDB's
  // precise release timestamp (day-level) when present, and fall back to the
  // release year for games (e.g. edited entries) where we only have the year. When
  // unreleased we force the status to wishlist and disable OWNED.
  const releaseYear = Number(f.year) || null;
  const isUnreleased = f.release_ts != null
    ? f.release_ts * 1000 > Date.now()
    : (releaseYear != null && releaseYear > new Date().getFullYear());
  // Human label for the hint: the full date when we have it, else the year.
  const releaseLabel = f.release_ts != null
    ? new Date(f.release_ts * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : releaseYear;
  useEffect(() => {
    if (isUnreleased && f.status !== "wishlist") set("status", "wishlist");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnreleased]);

  // Systems IGDB lists for this game (mapped to our PLATFORMS), so the PLATFORM
  // dropdown can be narrowed to just what the game actually released on. Empty
  // until we learn them (suggestion pick / FILL / edit-open lookup), and the
  // Select falls back to the full list while empty. Learned platforms replace it;
  // for a new entry we also snap the selection to the first supported system when
  // the current pick isn't one of them (an existing game keeps its saved system).
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>(game.platforms ?? []);
  const applyPlatforms = (igdbList: string[] | undefined) => {
    const mapped = igdbPlatformsToApp(igdbList);
    if (!mapped.length) return; // unmapped/none → keep the full-list fallback
    setAvailablePlatforms(mapped);
    if (isNew) setF((p: any) => (mapped.includes(p.platform) ? p : { ...p, platform: mapped[0] }));
  };

  // --- Title typeahead (combobox) ---
  type Suggestion = { igdbId: number; title: string; platforms: string[] };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false); // request pending (incl. debounce)
  const [activeIdx, setActiveIdx] = useState(-1); // highlighted row for keyboard nav
  const suggestBoxRef = useRef<HTMLDivElement | null>(null); // wrapper, for outside-click detection
  const suggestAbortRef = useRef<AbortController | null>(null);
  // True only when a title change comes from real typing (not a programmatic set
  // when picking a suggestion or filling). Gates the debounced fetch so selecting
  // a suggestion doesn't immediately re-open the dropdown.
  const typingRef = useRef(false);

  // Replay handling: completions so far, and whether this edit starts a new run.
  const completions = (game.playthroughs?.[currentUser.id]?.length ?? 0) + (myProg.status === "finished" ? 1 : 0);
  const startingReplay = myProg.status === "finished" && f.myStatus === "playing";
  const pickStatus = (k: string) => {
    // Only matters when the saved run is finished. Switching to playing starts a
    // fresh session (0h); switching back restores the finished run's hours so a
    // toggle doesn't silently wipe them before save.
    if (myProg.status === "finished") set("myHours", k === "playing" ? "" : (myProg.hours ?? ""));
    // At creation the hours field only shows for playing/finished — clear any typed
    // value when switching to a status that hides it, so it isn't saved.
    else if (isNew && k !== "playing" && k !== "finished") set("myHours", "");
    set("myStatus", k);
  };

  // Pull metadata into the form. With no argument it's a title-text search (the
  // FILL button); when an igdbId is passed (the user picked a suggestion) the
  // lookup is by exact id, so the precise game fills even among same-named editions.
  const autoFill = async (igdbId?: number | null) => {
    if (!f.title.trim()) return;
    setFetchState("loading");
    try {
      // Only ask for a price if we don't already have one (a scan may have priced
      // it). When we do ask, pass the scanned UPC so PriceCharting matches the
      // exact edition rather than guessing from the title.
      const wantPrice = priceEnabled && !priceTiers;
      const r = await fetch("/api/metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: f.title.trim(), upc: f.upc || undefined, withPrice: wantPrice, igdbId: igdbId ?? undefined }) });
      const m = await r.json();
      // Price (in EUR cents) only comes back when we asked and a product matched.
      // When present, fill the value from the tier matching the current condition
      // and keep the tiers for re-pricing. When absent we leave any existing price
      // untouched — a scan may have already priced this game.
      const tiers: PriceTiers | null = m.price
        ? { loose: m.price.loose_cents ?? null, cib: m.price.cib_cents ?? null, new: m.price.new_cents ?? null }
        : null;
      if (tiers) { setPriceTiers(tiers); setPricedName(m.price?.name || ""); }
      setF((p: any) => {
        // Rating is intentionally left untouched — it's the user's own score to set,
        // so we never seed it from IGDB.
        const next = { ...p, title: m.title || p.title, cover: m.cover || p.cover, description: m.description || p.description, developer: m.developer || p.developer, publisher: m.publisher || p.publisher, year: m.year || p.year, release_ts: m.release_ts ?? p.release_ts, genre: genres.includes(m.genre) ? m.genre : p.genre, hltb: m.hltb || p.hltb, screenshots: m.screenshots?.length ? m.screenshots : p.screenshots, igdb_id: m.igdb_id ?? p.igdb_id };
        if (tiers) {
          next.pricecharting_id = m.price.pricecharting_id ?? p.pricecharting_id;
          const cents = tierForCondition(tiers, p.condition);
          if (cents != null) next.value_eur = Math.round(cents / 100);
        }
        return next;
      });
      applyPlatforms(m.platforms);
      setFetchState("done");
    } catch { setFetchState("empty"); }
  };

  // A barcode scan opens this form pre-seeded with just a title (and maybe a
  // price) from the UPC database — but no IGDB metadata. Run the same lookup the
  // title typeahead uses so cover/developer/publisher/year/genre/HLTB fill in
  // automatically, without the user having to re-pick the title. Once, on open,
  // and only for a scan-seeded new entry (a manual "Add" has no upc).
  const scanFilledRef = useRef(false);
  useEffect(() => {
    if (scanFilledRef.current) return;
    if (isNew && game.upc && (game.title || "").trim() && !game.igdb_id) {
      scanFilledRef.current = true;
      void autoFill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy backfill: a known game that predates the cached `platforms` column has
  // its systems looked up once on open (and persisted on the next save). Games
  // that already carry platforms — or have no igdb_id — skip the call entirely,
  // which is the whole point: after one save we never hit IGDB on edit again.
  useEffect(() => {
    if (isNew || !game.igdb_id || (game.platforms?.length ?? 0) > 0) return;
    let active = true;
    fetch("/api/metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: game.title || "", igdbId: game.igdb_id }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (active && m) applyPlatforms(m.platforms); })
      .catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced title typeahead. Fires only while the user is actively typing
  // (typingRef), min 2 chars. The box opens immediately in a "searching" state so
  // typing feels responsive; the actual request is debounced 300ms after the last
  // keystroke. Each run aborts the previous in-flight request so a stale response
  // can't clobber a newer query.
  useEffect(() => {
    if (!typingRef.current) return;
    suggestAbortRef.current?.abort(); // cancel any prior in-flight request first
    const q = f.title.trim();
    if (q.length < 2) { setSuggestions([]); setSuggestLoading(false); setShowSuggest(false); return; }
    setShowSuggest(true);
    setSuggestLoading(true);
    const ctrl = new AbortController();
    suggestAbortRef.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: q }), signal: ctrl.signal });
        const data = await r.json();
        const list: Suggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(list);
        setActiveIdx(-1);
        setSuggestLoading(false);
      } catch (e) {
        // An abort means a newer keystroke took over — leave state to that run.
        // A real failure stops the spinner and falls through to "no matches".
        if ((e as { name?: string })?.name !== "AbortError") { setSuggestions([]); setSuggestLoading(false); }
      }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [f.title]);

  // Close the dropdown on a click outside the title combobox.
  useEffect(() => {
    if (!showSuggest) return;
    const onDown = (e: MouseEvent) => {
      if (suggestBoxRef.current && !suggestBoxRef.current.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSuggest]);

  // Picking a suggestion: this title change is programmatic (typingRef off so the
  // dropdown doesn't reopen), then fill the exact game by its IGDB id.
  const pickSuggestion = (s: Suggestion) => {
    typingRef.current = false;
    suggestAbortRef.current?.abort();
    setShowSuggest(false);
    setSuggestLoading(false);
    setSuggestions([]);
    setActiveIdx(-1);
    setFetchState("idle");
    set("title", s.title);
    set("igdb_id", s.igdbId);
    applyPlatforms(s.platforms); // the suggestion already carries the game's systems
    void autoFill(s.igdbId);
  };

  const onTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggest || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
    else if (e.key === "Enter") {
      if (activeIdx >= 0 && activeIdx < suggestions.length) { e.preventDefault(); pickSuggestion(suggestions[activeIdx]); }
    } else if (e.key === "Escape") { e.preventDefault(); setShowSuggest(false); }
  };

  const save = () => {
    if (!f.title.trim()) return;
    // An unreleased game can only be wishlisted, regardless of any earlier toggle.
    const status = isUnreleased ? "wishlist" : f.status;
    onSave({
      id: f.id, title: f.title, platform: f.platform, status, condition: f.condition,
      region: f.region, genre: f.genre, year: Number(f.year) || null, developer: f.developer,
      publisher: f.publisher, rating: f.rating == null ? null : Number(f.rating),
      value_cents: (Number(f.value_eur) || 0) * 100, cover: f.cover, description: f.description,
      screenshots: f.screenshots, platforms: availablePlatforms, hltb: f.hltb, igdb_id: f.igdb_id, pricecharting_id: f.pricecharting_id ?? null,
      myStatus: status === "owned" ? f.myStatus : undefined, myHours: Number(f.myHours) || 0,
    });
  };

  // Narrow the PLATFORM dropdown to the game's systems when we know them; fall back
  // to the full list otherwise. The current selection is always kept selectable so
  // a saved system (or one IGDB doesn't list) is never dropped from the options.
  const platformOpts = availablePlatforms.length
    ? (availablePlatforms.includes(f.platform) ? availablePlatforms : [f.platform, ...availablePlatforms])
    : PLATFORMS;

  const inp: React.CSSProperties = { width: "100%", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "var(--ink)", padding: "10px 12px", fontSize: 14, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 6, display: "block" };
  const Field = ({ label, children }: any) => <div><label style={lbl}>{label}</label>{children}</div>;
  // Native select with the browser arrow suppressed, plus our own chevron padded
  // in from the right edge so it isn't jammed against the border.
  const Select = ({ value, opts, onChange, labelFor }: any) => (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inp, cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", paddingRight: 34 }}>
        {opts.map((o: string) => <option key={o} value={o}>{labelFor ? labelFor(o) : o}</option>)}
      </select>
      <ChevronDown size={16} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ink-dim)" }} />
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }} className="sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", overflowY: "auto", overflowX: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)" }}>{isNew ? "NEW ENTRY" : "EDIT"}</div>
          <button onClick={onClose} style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>TITLE</label>
          <div ref={suggestBoxRef} style={{ position: "relative" }}>
            <input style={inp} value={f.title}
              onChange={(e) => { typingRef.current = true; set("title", e.target.value); setFetchState("idle"); }}
              onKeyDown={onTitleKeyDown}
              onFocus={() => { if (suggestions.length) setShowSuggest(true); }}
              placeholder="Start typing a game title…" autoComplete="off"
              role="combobox" aria-expanded={showSuggest} aria-autocomplete="list" />
            {showSuggest && (
              <div role="listbox" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 80, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", boxShadow: "0 10px 30px #000a", overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
                {suggestLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", color: "var(--ink-dim)", fontSize: 12.5, fontFamily: "var(--display)" }}>
                    <Loader2 size={13} className="spin" /> Searching for titles…
                  </div>
                ) : suggestions.length === 0 ? (
                  <div style={{ padding: "11px 12px", color: "var(--ink-dim)", fontSize: 12.5, fontFamily: "var(--display)" }}>No matches found.</div>
                ) : (
                  suggestions.map((s, i) => {
                    // One system → a tag in that system's colour. More than one →
                    // a neutral "MULTIPLE" tag, with every system listed below the title.
                    const multi = s.platforms.length > 1;
                    const single = s.platforms.length === 1 ? s.platforms[0] : null;
                    const tint = single ? tintFor(single) : null;
                    return (
                      <button key={s.igdbId} type="button" role="option" aria-selected={i === activeIdx}
                        onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                        onMouseEnter={() => setActiveIdx(i)}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 12px", border: "none", cursor: "pointer", background: i === activeIdx ? "var(--accent2)22" : "transparent", borderBottom: i < suggestions.length - 1 ? "1px solid var(--line)" : "none" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: "var(--ink)", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                          {multi && (
                            <div style={{ marginTop: 2, fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.platforms.join(" · ")}</div>
                          )}
                        </div>
                        {multi && (
                          <span style={{ flexShrink: 0, fontSize: 10, fontFamily: "var(--display)", fontWeight: 700, padding: "3px 8px", borderRadius: "var(--radius)", border: "1px solid var(--line)", color: "var(--ink-dim)", background: "transparent" }}>MULTIPLE</span>
                        )}
                        {single && tint && (
                          <span style={{ flexShrink: 0, fontSize: 10, fontFamily: "var(--display)", fontWeight: 700, padding: "3px 8px", borderRadius: "var(--radius)", border: `1px solid ${tint}`, color: tint, background: tint + "1a" }}>{single}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
          {fetchState === "loading" && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, fontSize: 11.5, fontWeight: 700, color: "var(--accent3)", fontFamily: "var(--display)" }}>
              <Loader2 size={13} className="spin" /> Filling in details…
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16, display: "flex", gap: 14 }}>
          <div style={{ width: 88, flexShrink: 0 }}><Cover g={{ ...f, value_cents: 0 } as Game} ratio={1.33} profiles={[]} /></div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={lbl}>BOX ART</label>
            <input style={inp} value={f.cover} onChange={(e) => set("cover", e.target.value)} placeholder="Image URL (or tap FILL)" />
            <span style={{ fontSize: 10, color: fetchState === "empty" ? "var(--bad)" : "var(--ink-dim)", fontFamily: "var(--display)", lineHeight: 1.4 }}>
              {fetchState === "loading" && `Looking up via IGDB + HLTB${priceEnabled ? " + PriceCharting" : ""}…`}{fetchState === "done" && (pricedName ? `✓ Details filled · priced from “${pricedName}”` : "✓ Details filled.")}{fetchState === "empty" && "No match. Fill manually."}{fetchState === "idle" && "Pick a suggested title to auto-fill, or enter details manually."}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>STATUS</label>
          <div style={{ display: "flex", gap: 8 }}>
            {([["owned", "OWNED", Box], ["wishlist", "WISHLIST", Heart]] as const).map(([k, l, Ic]) => {
              const active = f.status === k;
              const disabled = k === "owned" && isUnreleased;
              return (
                <button key={k} type="button" disabled={disabled} onClick={() => { if (!disabled) set("status", k); }}
                  title={disabled ? "Not released yet — wishlist only" : undefined}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 0", border: `1px solid ${active ? "var(--accent2)" : "var(--line)"}`, borderRadius: "var(--radius)", cursor: disabled ? "not-allowed" : "pointer", background: active ? "var(--accent2)22" : "var(--bg)", color: active ? "var(--ink)" : "var(--ink-dim)", opacity: disabled ? 0.4 : 1, fontFamily: "var(--display)", fontWeight: 700, fontSize: 12 }}><Ic size={15} /> {l}</button>
              );
            })}
          </div>
          {isUnreleased && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)", lineHeight: 1.4 }}>
              <CalendarClock size={13} color="var(--accent3)" style={{ flexShrink: 0 }} /> Releases {releaseLabel} — wishlist only until it&apos;s out.
            </div>
          )}
        </div>

        {f.status === "owned" && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>YOUR PLAY STATUS · {currentUser.name}{completions > 0 && <span style={{ color: "var(--good)" }}> · COMPLETED {completions}×</span>}</label>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <select value={f.myStatus} onChange={(e) => pickStatus(e.target.value)} style={{ ...inp, cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", paddingRight: 34, fontFamily: "var(--display)", fontWeight: 700, color: playColor(f.myStatus), borderColor: playColor(f.myStatus) }}>
                {Object.entries(PLAY_STATUS).map(([k, v]) => <option key={k} value={k} style={{ color: "var(--ink)", background: "var(--panel)" }}>{v.label}</option>)}
              </select>
              <ChevronDown size={16} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ink-dim)" }} />
            </div>
            {startingReplay && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, padding: "9px 11px", borderRadius: "var(--radius)", background: "var(--accent2)1a", border: "1px solid var(--accent2)", fontSize: 11.5, color: "var(--ink)", lineHeight: 1.4 }}>
                <Sparkles size={14} color="var(--accent2)" style={{ flexShrink: 0 }} />
                New playthrough — your finished run ({myProg.hours}h) will be saved to history.
              </div>
            )}
            {(!isNew || f.myStatus === "playing" || f.myStatus === "finished") && (
              <>
                <label style={lbl}>YOUR HOURS PLAYED{startingReplay && " · NEW SESSION"}</label>
                <input style={inp} type="number" value={f.myHours} onChange={(e) => set("myHours", e.target.value)} placeholder="0" />
              </>
            )}
          </div>
        )}

        {f.myStatus === "finished" && (
          <div style={{ marginBottom: 14 }}>
            <Field label="RATING"><div style={{ paddingTop: 4 }}><StarRating value={f.rating == null ? null : Number(f.rating)} onChange={(r) => set("rating", r)} /></div></Field>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="PLATFORM"><Select value={f.platform} opts={platformOpts} onChange={(v: string) => set("platform", v)} /></Field>
          <Field label="CONDITION"><Select value={f.condition} opts={CONDITIONS} labelFor={conditionLabel} onChange={(v: string) => {
            set("condition", v);
            // If FILL fetched prices, re-derive the value for the new condition.
            if (priceTiers) { const cents = tierForCondition(priceTiers, v); if (cents != null) set("value_eur", Math.round(cents / 100)); }
          }} /></Field>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Field label="VALUE (€)"><input style={inp} type="number" value={f.value_eur} onChange={(e) => set("value_eur", e.target.value)} placeholder="0" /></Field>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {!isNew && <button onClick={() => onDelete(f.id)} style={{ padding: "13px 16px", border: "1px solid var(--bad)", borderRadius: "var(--radius)", cursor: "pointer", background: "transparent", color: "var(--bad)", fontFamily: "var(--display)", fontWeight: 700 }}>DELETE</button>}
          <button onClick={save} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 0", border: "none", borderRadius: "var(--radius)", cursor: "pointer", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 14 }}><Check size={17} strokeWidth={3} /> {isNew ? "ADD TO VAULT" : "SAVE"}</button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ preferences, priceEnabled, priceTokenSet, household, role, members, currentUserId, onRenameVault, onRegenerateInvite, onRemoveMember, onLeaveVault, onSave, onSavePreferences, onClose }: {
  preferences: Profile["preferences"]; priceEnabled: boolean; priceTokenSet: boolean;
  household: Household; role: HouseholdRole; members: MemberWithProfile[]; currentUserId: string;
  onRenameVault: (name: string) => Promise<void> | void;
  onRegenerateInvite: () => Promise<string | null>;
  onRemoveMember: (userId: string) => Promise<void> | void;
  onLeaveVault: () => Promise<void> | void;
  onSave: (key: "pricecharting_enabled" | "pricecharting_token", value: boolean | string) => void;
  onSavePreferences: (preferences: Profile["preferences"]) => void;
  onClose: () => void;
}) {
  useBodyScrollLock();
  // Write-only token field: we never receive the saved token, only whether one
  // exists, so the input starts empty and "paste to replace" rather than showing it.
  const [tokenDraft, setTokenDraft] = useState("");
  // Your Vault local state.
  const isOwner = role === "owner";
  const [code, setCode] = useState(household.invite_code);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(household.name);
  const [copied, setCopied] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Settings is a menu: null shows the three section buttons; a value drills into
  // that pane (with a back arrow in the header).
  const [pane, setPane] = useState<"vault" | "dashboard" | "api" | null>(null);
  // Leaving as the sole member deletes the vault (and all its games) — warn for that.
  const soleMember = members.length <= 1;
  const inviteLink = typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : `/join/${code}`;

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  const regenerate = async () => {
    if (vaultBusy) return; setVaultBusy(true);
    try { const next = await onRegenerateInvite(); if (next) setCode(next); } catch { /* surfaced by reload */ } finally { setVaultBusy(false); }
  };
  const saveName = async () => {
    const n = nameDraft.trim();
    if (!n || n === household.name) { setEditingName(false); setNameDraft(household.name); return; }
    setVaultBusy(true);
    try { await onRenameVault(n); setEditingName(false); } finally { setVaultBusy(false); }
  };
  const leave = async () => {
    if (vaultBusy) return; setVaultBusy(true);
    try { await onLeaveVault(); window.location.assign("/"); } catch { setVaultBusy(false); }
  };
  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 8, display: "block" };
  const inp: React.CSSProperties = { flex: 1, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "var(--ink)", padding: "10px 12px", fontSize: 14, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box" };

  const menu: { key: "vault" | "dashboard" | "api"; icon: typeof Home; title: string; desc: string }[] = [
    { key: "vault", icon: Home, title: "Your Vault", desc: isOwner ? "Name, invite link & members" : "Members & leaving the vault" },
    { key: "dashboard", icon: LayoutGrid, title: "Dashboard Customization", desc: "Choose which overview blocks show" },
    { key: "api", icon: Tag, title: "External API's", desc: "PriceCharting pricing & token" },
  ];
  const paneTitle = pane === "vault" ? "YOUR VAULT" : pane === "dashboard" ? "DASHBOARD" : pane === "api" ? "EXTERNAL API'S" : "SETTINGS";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }} className="sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", overflowY: "auto", overflowX: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {pane && (
              <button onClick={() => setPane(null)} aria-label="Back"
                style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><ChevronLeft size={16} /></button>
            )}
            <div style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{paneTitle}</div>
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>

        {/* ---- MENU ---- */}
        {pane === null && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {menu.map(({ key, icon: Icon, title, desc }) => (
              <button key={key} onClick={() => setPane(key)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: "pointer", color: "var(--ink)", textAlign: "left", width: "100%" }}>
                <div style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 12, background: "var(--panel-alt)", color: "var(--accent)" }}><Icon size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-dim)", marginTop: 2 }}>{desc}</div>
                </div>
                <ChevronRight size={18} color="var(--ink-dim)" style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        {/* ---- YOUR VAULT ---- */}
        {pane === "vault" && (
        <div>
          <div style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.5, marginBottom: 12 }}>
            {isOwner ? "You own this vault. Share the invite link to bring household members in." : "You're a member of this vault."}
          </div>

          {/* Vault name */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", marginBottom: 10 }}>
            {editingName ? (
              <>
                <input style={inp} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditingName(false); setNameDraft(household.name); } }} />
                <button onClick={saveName} disabled={vaultBusy} aria-label="Save name"
                  style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 36, height: 36, border: "none", borderRadius: "var(--radius)", cursor: "pointer", background: "var(--accent2)", color: "var(--bg)" }}><Check size={16} strokeWidth={3} /></button>
                <button onClick={() => { setEditingName(false); setNameDraft(household.name); }} aria-label="Cancel"
                  style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 36, height: 36, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: "pointer", color: "var(--ink-dim)" }}><X size={16} /></button>
              </>
            ) : (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>VAULT NAME</div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{household.name}</div>
                </div>
                {isOwner && (
                  <button onClick={() => { setNameDraft(household.name); setEditingName(true); }} aria-label="Rename vault"
                    style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 34, height: 34, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink-dim)" }}><Pencil size={14} /></button>
                )}
              </>
            )}
          </div>

          {/* Invite code + link */}
          <div style={{ padding: "12px 14px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>INVITE CODE</div>
                <div style={{ fontFamily: "var(--display)", fontSize: 19, fontWeight: 700, letterSpacing: 3, marginTop: 3 }}>{code}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={copyInvite}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "none", borderRadius: "var(--radius)", cursor: "pointer", background: copied ? "var(--good)" : "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11 }}>
                  {copied ? <><Check size={13} strokeWidth={3} /> COPIED</> : <><Copy size={13} /> COPY LINK</>}
                </button>
                {isOwner && (
                  <button onClick={regenerate} disabled={vaultBusy} title="Regenerate code (invalidates the old link)" aria-label="Regenerate invite code"
                    style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 34, height: 34, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 99, cursor: vaultBusy ? "wait" : "pointer", color: "var(--ink-dim)" }}>
                    {vaultBusy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 8, wordBreak: "break-all" }}>{inviteLink}</div>
          </div>

          {/* Members */}
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><Users size={12} />Members ({members.length})</label>
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            {members.map((m, i) => {
              const p = m.profile;
              const isSelf = m.user_id === currentUserId;
              return (
                <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "var(--bg)", borderTop: i ? "1px solid var(--line)" : "none" }}>
                  {p ? <Avatar user={p} size={30} /> : <div style={{ width: 30, height: 30, borderRadius: 99, background: "var(--panel-alt)" }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p?.name ?? "Member"}{isSelf && <span style={{ color: "var(--ink-dim)", fontWeight: 400 }}> · you</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: m.role === "owner" ? "var(--accent3)" : "var(--ink-dim)", fontFamily: "var(--display)", letterSpacing: 1, marginTop: 2 }}>
                      {m.role === "owner" ? <><Crown size={11} /> OWNER</> : "MEMBER"}
                    </div>
                  </div>
                  {isOwner && !isSelf && (
                    <button onClick={() => onRemoveMember(m.user_id)} aria-label={`Remove ${p?.name ?? "member"}`}
                      style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--bad)" }}><UserMinus size={14} /></button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Leave / delete */}
          <div style={{ marginTop: 12 }}>
            {confirmLeave ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--bg)", border: "1px solid var(--bad)", borderRadius: "var(--radius)" }}>
                <span style={{ flex: 1, fontSize: 12, color: "var(--ink)", lineHeight: 1.4 }}>
                  {soleMember ? "Delete this vault and everything in it? This can't be undone." : isOwner ? "Leave? Ownership passes to another member." : "Leave this vault?"}
                </span>
                <button onClick={leave} disabled={vaultBusy}
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "none", borderRadius: "var(--radius)", cursor: vaultBusy ? "wait" : "pointer", background: "var(--bad)", color: "#fff", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11 }}>
                  {vaultBusy ? <Loader2 size={13} className="spin" /> : <Check size={13} strokeWidth={3} />} {soleMember ? "DELETE" : "LEAVE"}
                </button>
                <button onClick={() => setConfirmLeave(false)} disabled={vaultBusy}
                  style={{ flexShrink: 0, padding: "8px 12px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: "pointer", color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11 }}>CANCEL</button>
              </div>
            ) : (
              <button onClick={() => setConfirmLeave(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--bad)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12 }}>
                {soleMember ? <><Trash2 size={14} /> Delete vault</> : <><LogOut size={14} /> Leave vault</>}
              </button>
            )}
          </div>
        </div>
        )}

        {/* ---- EXTERNAL API'S ---- */}
        {pane === "api" && (
        <div>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><Tag size={12} />Pricing</label>
          <div style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.5, marginBottom: 12 }}>
            Shared with your household. When on, auto-filling a game also fetches a market value from the paid PriceCharting API (converted to € at the live rate) and picks the price matching its condition. Turn it off when you&apos;re not subscribed — values then stay manual.
          </div>
          <button role="switch" aria-checked={priceEnabled} onClick={() => onSave("pricecharting_enabled", !priceEnabled)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 14px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: "pointer", color: "var(--ink)", textAlign: "left" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Use PriceCharting API{priceEnabled && <span style={{ marginLeft: 8, fontSize: 10, color: "var(--accent2)", fontFamily: "var(--display)" }}>ACTIVE</span>}</span>
            <span style={{ flexShrink: 0, position: "relative", width: 40, height: 23, borderRadius: 99, background: priceEnabled ? "var(--accent2)" : "var(--panel-alt)", border: "1px solid var(--line)", transition: "background .15s" }}>
              <span style={{ position: "absolute", top: 2, left: priceEnabled ? 19 : 2, width: 17, height: 17, borderRadius: 99, background: priceEnabled ? "var(--bg)" : "var(--ink-dim)", transition: "left .15s" }} />
            </span>
          </button>

          {priceEnabled && (
          <div style={{ marginTop: 12 }}>
            <label style={{ ...lbl, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              API token{priceTokenSet && <span style={{ color: "var(--good)", fontSize: 10 }}>● SAVED</span>}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="password" autoComplete="off" style={inp} value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)}
                placeholder={priceTokenSet ? "•••••••••• — paste to replace" : "Paste your 40-char token"} />
              <button onClick={() => { onSave("pricecharting_token", tokenDraft.trim()); setTokenDraft(""); }} disabled={!tokenDraft.trim()}
                style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 14px", border: "none", borderRadius: "var(--radius)", cursor: tokenDraft.trim() ? "pointer" : "not-allowed", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12, opacity: tokenDraft.trim() ? 1 : 0.5 }}>
                <Check size={14} strokeWidth={3} /> SAVE
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", lineHeight: 1.4 }}>
                Stored for your household, used server-side — never shown back. Leave empty to use a server-set secret.
              </span>
              {priceTokenSet && <button onClick={() => { onSave("pricecharting_token", ""); setTokenDraft(""); }}
                style={{ flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--bad)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 10.5 }}>REMOVE</button>}
            </div>
          </div>
          )}
        </div>
        )}

        {/* ---- DASHBOARD CUSTOMIZATION ---- */}
        {pane === "dashboard" && (
        <div>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><LayoutGrid size={12} />Overview sections</label>
          <div style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.5, marginBottom: 12 }}>
            Just for you — pick which blocks show on your overview. The hero and your collection stats always stay.
          </div>
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            {OVERVIEW_SECTIONS.map(({ key, label }, i) => {
              const on = preferences?.overview?.[key] !== false;
              return (
                <button key={key} role="switch" aria-checked={on}
                  onClick={() => onSavePreferences({ ...preferences, overview: { ...preferences?.overview, [key]: !on } })}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 14px", background: "var(--bg)", border: "none", borderTop: i ? "1px solid var(--line)" : "none", cursor: "pointer", color: "var(--ink)", textAlign: "left" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
                  <span style={{ flexShrink: 0, position: "relative", width: 40, height: 23, borderRadius: 99, background: on ? "var(--accent2)" : "var(--panel-alt)", border: "1px solid var(--line)", transition: "background .15s" }}>
                    <span style={{ position: "absolute", top: 2, left: on ? 19 : 2, width: 17, height: 17, borderRadius: 99, background: on ? "var(--bg)" : "var(--ink-dim)", transition: "left .15s" }} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// Restrict to the 1-D retail barcode symbologies a game case actually carries —
// fewer formats means faster, more reliable decoding off a shaky phone camera.
// TRY_HARDER spends more effort per frame, which matters for the small, dense
// barcodes on Switch cartridge cases.
const BARCODE_HINTS = new Map<DecodeHintType, any>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]],
  [DecodeHintType.TRY_HARDER, true],
]);

// ZXing defaults to a 500ms gap between decode attempts (≈2 tries/sec, feels
// laggy). 80ms gives ~12 tries/sec for near-instant reads.
const SCAN_OPTIONS = { delayBetweenScanAttempts: 80, delayBetweenScanSuccess: 250 };

// Ask for a high-resolution rear-camera stream — small barcodes (Switch) need
// the extra pixels to resolve; `ideal` degrades gracefully on weaker cameras.
const SCAN_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
};

function ScannerModal({ resolve, onResolved, onClose }: {
  resolve: (upc: string) => Promise<{ title: string | null; error?: string; resetAt?: number; price?: PricePayload | null; pricecharting_id?: string | null }>;
  onResolved: (res: ScanResult) => void;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const lastFailedRef = useRef("");
  const audioRef = useRef<AudioContext | null>(null);
  const beepBufferRef = useRef<AudioBuffer | null>(null);
  const [phase, setPhase] = useState<"scanning" | "looking" | "notfound" | "error">("scanning");
  const [note, setNote] = useState("");
  const [manual, setManual] = useState("");

  // Confirmation sound (bleep.mp3) + a haptic buzz on phones, fired the instant a
  // barcode is decoded — the "got it" feedback. The mp3 is decoded into the
  // already-gesture-unlocked AudioContext so it plays on iOS without a fresh tap;
  // a synth tone covers the brief window before the asset finishes loading.
  const beep = () => {
    const ctx = audioRef.current;
    if (ctx) {
      try {
        ctx.resume?.();
        const buf = beepBufferRef.current;
        if (buf) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start();
        } else {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.2);
        }
      } catch { /* audio not available */ }
    }
    try { navigator.vibrate?.(60); } catch { /* no haptics */ }
  };

  const lookup = async (raw: string) => {
    const code = raw.replace(/\D/g, "");
    if (code.length < 6) { handledRef.current = false; return; }
    handledRef.current = true;
    setPhase("looking");
    try {
      const r = await resolve(code);
      if (r?.title) { onResolved({ title: r.title, upc: code, price: r.price ?? null, pricecharting_id: r.pricecharting_id ?? null }); return; }
      lastFailedRef.current = code; // don't loop-beep the same unmatched barcode
      // X-RateLimit-Reset may arrive as an absolute epoch (seconds) or as
      // seconds-until-reset; large values are clearly an epoch, small ones a delta.
      const raw = r?.resetAt ?? 0;
      const resetMs = raw > 1e6 ? raw * 1000 : raw ? Date.now() + raw * 1000 : 0;
      const resetHint = resetMs
        ? ` Resets around ${new Date(resetMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
        : "";
      setNote(
        r?.error === "too_fast" ? "Scanning too fast — wait a few seconds, then scan again." :
        r?.error === "rate_limited" ? `Daily lookup limit reached — type the title below instead.${resetHint}` :
        r?.error === "invalid" ? "That barcode looks invalid — re-check the digits." :
        r?.error === "network" ? "Lookup failed (network) — try again." :
        "No match in the barcode database — type the title below."
      );
    } catch {
      setNote("Lookup failed — try again or type the title below.");
    }
    setPhase("notfound");
    handledRef.current = false; // allow another attempt without remounting
  };

  useEffect(() => {
    let active = true;
    // Create + unlock the audio context now, while we're still close to the tap
    // that opened the scanner — iOS only allows audio started from a gesture.
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioRef.current = ctx;
        ctx.resume?.();
        // Fetch + decode the scan sound up front so it's ready the moment a code
        // is read. decodeAudioData's callback form keeps older Safari happy.
        fetch("/sounds/bleep.mp3")
          .then((r) => r.arrayBuffer())
          .then((data) => ctx.decodeAudioData(data, (decoded) => { beepBufferRef.current = decoded; }, () => {}))
          .catch(() => { /* fall back to the synth beep */ });
      }
    } catch { /* audio not available */ }

    const reader = new BrowserMultiFormatReader(BARCODE_HINTS, SCAN_OPTIONS);
    (async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          SCAN_CONSTRAINTS,
          videoRef.current!,
          (result) => {
            if (!active || handledRef.current || !result) return;
            const code = result.getText().replace(/\D/g, "");
            if (code === lastFailedRef.current) return; // already tried, no match
            beep();
            lookup(code);
          }
        );
        if (active) controlsRef.current = controls;
        else controls.stop();
      } catch {
        if (active) setPhase("error");
      }
    })();
    return () => {
      active = false;
      controlsRef.current?.stop();
      audioRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const camLive = phase === "scanning" || phase === "looking" || phase === "notfound";
  const status =
    phase === "looking" ? "Looking up…" :
    phase === "notfound" ? note :
    phase === "error" ? "Camera unavailable. Type the barcode digits below." :
    "Point at the barcode on the box.";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000d", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 80 }} className="sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)" }}>SCAN BARCODE</div>
          <button onClick={onClose} style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>

        <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: "var(--radius)", overflow: "hidden", background: "#000", border: "1px solid var(--line)", marginBottom: 12 }}>
          <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: camLive ? "block" : "none" }} />
          {camLive && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
              <div style={{ width: "78%", height: 92, border: "2px solid var(--accent2)", borderRadius: 10, boxShadow: "0 0 0 100vmax #0006" }} />
            </div>
          )}
          {phase === "looking" && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#0008" }}>
              <Loader2 size={28} className="spin" color="#fff" />
            </div>
          )}
          {phase === "error" && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--ink-dim)" }}>
              <ScanLine size={34} style={{ opacity: 0.5 }} />
            </div>
          )}
        </div>

        <div style={{ fontSize: 12.5, color: phase === "notfound" ? "var(--bad)" : "var(--ink-dim)", fontFamily: "var(--display)", lineHeight: 1.4, marginBottom: 14, textAlign: "center" }}>
          {status}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); lookup(manual); }} style={{ display: "flex", gap: 8 }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder="Enter barcode digits"
            style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "var(--ink)", padding: "11px 12px", fontSize: 14, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box" }} />
          <button type="submit" disabled={manual.replace(/\D/g, "").length < 6 || phase === "looking"}
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 16px", border: "none", borderRadius: "var(--radius)", cursor: "pointer", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12, opacity: manual.replace(/\D/g, "").length < 6 || phase === "looking" ? 0.5 : 1 }}>
            <Check size={15} strokeWidth={3} /> LOOK UP
          </button>
        </form>
      </div>
    </div>
  );
}
