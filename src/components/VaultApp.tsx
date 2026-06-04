"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, X, Gamepad2, Trophy, Heart, Disc, LayoutGrid, Sparkles, Check, Box,
  ChevronLeft, ChevronDown, Pencil, Loader2, ImageIcon, Wand2, Library, Joystick,
  ScanLine, Settings, LogOut, Clock,
} from "lucide-react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useVault } from "@/lib/useVault";
import {
  type Game, type Profile, type PlayStatus, PLAY_STATUS, PLATFORM_TINT,
  CONDITIONS, REGIONS, money, fmtDate,
} from "@/lib/types";

const FALLBACK_TINTS = ["#9b8cff", "#6fc7b3", "#e6b667", "#e0738a", "#7fb2ff", "#c98cff"];
const hashIdx = (s = "", n = 1) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return h % n; };
const tintFor = (p: string) => PLATFORM_TINT[p] || FALLBACK_TINTS[hashIdx(p, FALLBACK_TINTS.length)];
const playColor = (k: string) => k === "playing" ? "var(--accent2)" : k === "finished" ? "var(--good)" : "var(--ink-dim)";
const getProg = (g: Game, uid?: string) => (uid && g.progress?.[uid]) || { status: "backlog" as PlayStatus, hours: 0 };
const progressEntries = (g: Game) => Object.entries(g.progress || {});
const playersOf = (g: Game) => progressEntries(g).filter(([, p]) => p.status === "playing");
const finishersOf = (g: Game) => progressEntries(g).filter(([, p]) => p.status === "finished");

export default function VaultApp({ currentUser }: { currentUser: Profile }) {
  const uid = currentUser.id;
  const { games, profiles, platforms, genres, loading, saveGame, deleteGame, saveSettings } = useVault(uid);
  const userById = (id?: string | null) => profiles.find((p) => p.id === id) || null;

  const [view, setView] = useState<"home" | "collection">("home");
  const [detail, setDetail] = useState<Game | null>(null);
  const [editing, setEditing] = useState<Partial<Game> | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const resolveUpc = async (upc: string): Promise<{ title: string | null; error?: string }> => {
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

  const owned = games.filter((g) => g.status === "owned");
  const wishlist = games.filter((g) => g.status === "wishlist");
  const collectionValue = owned.reduce((s, g) => s + (g.value_cents || 0), 0);

  const playingSlides: { g: Game; pid: string; hours: number }[] = [];
  owned.forEach((g) => playersOf(g).forEach(([pid, p]) => playingSlides.push({ g, pid, hours: p.hours })));
  playingSlides.sort((a, b) => (a.pid === uid ? 0 : 1) - (b.pid === uid ? 0 : 1));

  const myFinished = owned.filter((g) => getProg(g, uid).status === "finished").length;
  const myBacklog = owned.filter((g) => getProg(g, uid).status === "backlog").length;

  const byPlatform = platforms.map((p) => ({ p, count: owned.filter((g) => g.platform === p).length }))
    .filter((x) => x.count).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...byPlatform.map((x) => x.count));
  const recent = [...games];

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
          if (!progressEntries(g).some(([, p]) => p.status === playFilter)) return false;
        } else {
          const st = getProg(g, playerFilter).status;
          if (playFilter === "all") { if (st === "backlog") return false; }
          else if (st !== playFilter) return false;
        }
      }
      return true;
    });
    const cmp: Record<string, (a: Game, b: Game) => number> = {
      recent: () => 0,
      name: (a, b) => a.title.localeCompare(b.title),
      value: (a, b) => (b.value_cents || 0) - (a.value_cents || 0),
    };
    return [...list].sort(cmp[sort]);
  }, [games, q, status, platform, playFilter, playerFilter, sort]);

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--ink-dim)" }}><Loader2 size={26} className="spin" /></div>;
  }

  const topbar = (floating: boolean) => (
    <TopBar floating={floating} currentUser={currentUser} userMenu={userMenu} setUserMenu={setUserMenu}
      onScan={() => setScanOpen(true)}
      onSettings={() => setSettingsOpen(true)}
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
          <div style={{ position: "relative", maxWidth: 940, margin: "0 auto", padding: "24px 16px 110px" }}>
            <div className="fade home-col" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
              <section>
                <div style={{ fontSize: 11, letterSpacing: 2, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 14 }}>YOUR COLLECTION</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: "var(--display)", fontSize: 64, lineHeight: .9 }}>{owned.length}</div>
                  <div style={{ fontSize: 15, color: "var(--ink-dim)", paddingBottom: 6 }}>games owned</div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                  <MiniStat icon={Library} label="BACKLOG" value={myBacklog} color="var(--accent3)"
                    onClick={() => { setQ(""); setStatus("owned"); setPlatform("all"); setPlayerFilter(uid); setPlayFilter("backlog"); setView("collection"); }} />
                  <MiniStat icon={Check} label="FINISHED" value={myFinished} color="var(--good)"
                    onClick={() => { setQ(""); setStatus("owned"); setPlatform("all"); setPlayerFilter(uid); setPlayFilter("finished"); setView("collection"); }} />
                  <MiniStat icon={Heart} label="WISHLIST" value={wishlist.length} color="var(--accent)"
                    onClick={() => { setQ(""); setStatus("wishlist"); setPlatform("all"); setPlayerFilter("all"); setPlayFilter("all"); setView("collection"); }} />
                </div>
              </section>

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

              <section>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "13px 16px" }}>
                  <div style={{ fontSize: 11, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>EST. COLLECTION VALUE</div>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 }}>{money(collectionValue)}</span>
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {view === "collection" && (
        <div style={{ position: "relative", maxWidth: 940, margin: "0 auto", padding: "0 16px 110px" }}>
          {topbar(false)}
          <div className="fade">
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "11px 14px", marginBottom: 12 }}>
              <Search size={18} color="var(--ink-dim)" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", fontSize: 15, fontFamily: "var(--body)" }} />
              {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><X size={16} /></button>}
            </div>
            <div className="filter-grid">
              <FilterField label="Library" value={status} onChange={setStatus} options={[["all", "All games"], ["owned", "Owned"], ["wishlist", "Wishlist"]]} />
              <FilterField label="Player" value={playerFilter} onChange={setPlayerFilter} options={[["all", "Any player"], ...profiles.map((a) => [a.id, a.name] as [string, string])]} />
              <FilterField label="Played" value={playFilter} onChange={setPlayFilter} options={[["all", "Any status"], ["playing", "Playing"], ["finished", "Finished"], ["backlog", "Backlog"]]} />
              <FilterField label="System" value={platform} onChange={setPlatform} options={[["all", "All systems"], ...platforms.map((p) => [p, p] as [string, string])]} />
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
              <FilterField compact value={sort} onChange={setSort} options={[["recent", "Newest"], ["name", "A–Z"], ["value", "Value"]]} />
            </div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-dim)" }}>
                <Disc size={40} style={{ opacity: .5 }} />
                <div style={{ marginTop: 12, fontFamily: "var(--display)" }}>NO GAMES FOUND</div>
              </div>
            ) : (
              <div className="card-grid">
                {filtered.map((g) => <GameCard key={g.id} g={g} profiles={profiles} onClick={() => setDetail(g)} />)}
              </div>
            )}
          </div>
        </div>
      )}

      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, display: "flex", justifyContent: "center",
        padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", background: "linear-gradient(to top, var(--bg) 60%, transparent)", pointerEvents: "none" }}>
        <div style={{ display: "flex", gap: 6, background: "var(--panel)", padding: 5, borderRadius: 99, border: "1px solid var(--line)", boxShadow: "0 8px 28px -8px #000", pointerEvents: "auto" }}>
          {([["home", "OVERVIEW", Trophy], ["collection", "COLLECTION", LayoutGrid]] as const).map(([k, lbl, Ic]) => (
            <button key={k} onClick={() => setView(k)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 22px", border: "none", cursor: "pointer",
                borderRadius: 99, fontFamily: "var(--display)", fontWeight: 700, fontSize: 12, letterSpacing: 1,
                background: view === k ? "var(--accent)" : "transparent", color: view === k ? "var(--bg)" : "var(--ink-dim)" }}>
              <Ic size={15} strokeWidth={2.5} /> {lbl}
            </button>
          ))}
        </div>
      </nav>

      {liveDetail && <DetailView game={liveDetail} userById={userById} onClose={() => setDetail(null)} onEdit={() => setEditing(liveDetail)} />}
      {editing !== null && (
        <GameModal game={editing} currentUser={currentUser} platforms={platforms} genres={genres}
          onClose={() => setEditing(null)}
          onSave={async (g) => { await saveGame(g); setEditing(null); }}
          onDelete={async (id) => { await deleteGame(id); setEditing(null); setDetail(null); }} />
      )}
      {settingsOpen && (
        <SettingsModal games={games} platforms={platforms} genres={genres}
          onSave={saveSettings} onClose={() => setSettingsOpen(false)} />
      )}
      {scanOpen && (
        <ScannerModal resolve={resolveUpc} onClose={() => setScanOpen(false)}
          onResolved={(title) => { setScanOpen(false); setEditing({ title }); }} />
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
function Avatar({ user, size = 22 }: { user: Profile; size?: number }) {
  return (
    <span style={{ display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: 99, background: user.color + "30", border: `1px solid ${user.color}`, color: "var(--ink)", fontFamily: "var(--display)", fontWeight: 700, fontSize: size * 0.42, flexShrink: 0 }}>
      {user.name[0].toUpperCase()}
    </span>
  );
}

function Cover({ g, ratio = 1.32, profiles }: { g: Game; ratio?: number; profiles: Profile[] }) {
  const tint = tintFor(g.platform);
  const [err, setErr] = useState(false);
  const showArt = g.cover && !err;
  const finishers = finishersOf(g).map(([id]) => profiles.find((a) => a.id === id)).filter(Boolean) as Profile[];
  const players = playersOf(g).map(([id]) => profiles.find((a) => a.id === id)).filter(Boolean) as Profile[];
  return (
    <div style={{ width: "100%", aspectRatio: `1 / ${ratio}`, borderRadius: "var(--radius)", position: "relative", overflow: "hidden", border: "1px solid var(--line)", background: `linear-gradient(150deg, ${tint}33, var(--panel-alt))` }}>
      {showArt ? <img src={g.cover!} alt={g.title} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span style={{ fontFamily: "var(--display)", fontSize: 30, color: tint, opacity: .5 }}>{(g.title || "?")[0]}</span></div>}
      {g.status === "wishlist" && <div style={{ position: "absolute", top: 7, right: 7, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 99, background: "#13111ad0" }}><Heart size={12} color="var(--accent)" fill="var(--accent)" /></div>}
      {g.status === "owned" && (players.length > 0 || finishers.length > 0) && (
        <div style={{ position: "absolute", top: 7, right: 7, display: "flex", gap: 4 }}>
          {players.map((u) => <span key={"p" + u.id} title={`${u.name} playing`} style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, background: "#13111aea", border: `1.5px solid ${u.color}` }}><span className="pulse" style={{ width: 7, height: 7, borderRadius: 99, background: u.color }} /></span>)}
          {finishers.map((u) => <span key={"f" + u.id} title={`${u.name} finished`} style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, background: u.color, border: "1.5px solid var(--bg)" }}><Check size={11} color="var(--bg)" strokeWidth={3.5} /></span>)}
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

function FilterField({ label, value, onChange, options, compact }: { label?: string; value: string; onChange: (v: string) => void; options: [string, string][]; compact?: boolean }) {
  const current = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <label style={{ position: "relative", display: "flex", flexDirection: "column", gap: compact ? 0 : 4, cursor: "pointer", minWidth: 0 }}>
      {label && <span style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, paddingLeft: 2 }}>{label.toUpperCase()}</span>}
      <div style={{ position: "relative", display: "flex", alignItems: "center", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: compact ? "8px 30px 8px 12px" : "10px 30px 10px 13px" }}>
        <span style={{ fontSize: compact ? 12 : 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: compact ? "var(--display)" : "var(--body)" }}>{current}</span>
        <ChevronDown size={15} color="var(--ink-dim)" style={{ position: "absolute", right: 10, pointerEvents: "none" }} />
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", border: "none", appearance: "none" }}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </label>
  );
}

function TopBar({ floating, currentUser, userMenu, setUserMenu, onScan, onSettings, onAdd }: any) {
  const glass = floating
    ? { background: "rgba(20,17,26,0.34)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(10px)" as const }
    : { background: "var(--panel)", border: "1px solid var(--line)" };
  const iconBtn: React.CSSProperties = { display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 99, cursor: "pointer", color: floating ? "#fff" : "var(--ink)", ...glass };
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: floating ? "16px 16px 14px" : "20px 0 16px", position: "relative" }}>
      <div style={{ fontFamily: "var(--display)", fontSize: 19, letterSpacing: 1.5, fontWeight: 700, color: floating ? "#fff" : "var(--ink)", textShadow: floating ? "0 2px 12px rgba(0,0,0,0.5)" : "none" }}>GAMEVAULT</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onScan} aria-label="Scan" style={iconBtn}><ScanLine size={18} /></button>
        <button onClick={onSettings} aria-label="Settings" style={iconBtn}><Settings size={18} /></button>
        <button onClick={onAdd} aria-label="Add" style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 99, border: "none", cursor: "pointer", background: "var(--accent2)", color: "var(--bg)" }}><Plus size={19} strokeWidth={3} /></button>
        <div style={{ position: "relative" }}>
          <button onClick={() => setUserMenu((o: boolean) => !o)} aria-label="Account"
            style={{ display: "grid", placeItems: "center", border: `2px solid ${currentUser.color}`, background: floating ? "rgba(20,17,26,0.4)" : currentUser.color + "22", width: 38, height: 38, borderRadius: 99, cursor: "pointer", color: floating ? "#fff" : "var(--ink)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 14 }}>
            {currentUser.name[0].toUpperCase()}
          </button>
          {userMenu && (
            <>
              <div onClick={() => setUserMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", right: 0, top: 46, zIndex: 41, minWidth: 184, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 8, boxShadow: "0 12px 32px -10px #000" }}>
                <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--line)", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{currentUser.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 2 }}>Signed in</div>
                </div>
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
          <Gamepad2 size={34} color="var(--ink-dim)" style={{ opacity: .6 }} />
          <div style={{ fontFamily: "var(--display)", fontSize: 18, marginTop: 16 }}>Nothing in play</div>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 8, maxWidth: 260, lineHeight: 1.5 }}>Set one of your games to <span style={{ color: "var(--accent2)" }}>Playing</span> and it&apos;ll headline here.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "78vh", minHeight: 520, maxHeight: 820 }}>
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
        {showArt ? <img src={g.cover!} alt="" aria-hidden style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.25)", filter: "blur(28px) saturate(1.2) brightness(.6)" }} /> : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${tint}55, var(--bg))` }} />}
      </div>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        {showArt ? <img src={g.cover!} alt={g.title} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontFamily: "var(--display)", fontSize: 96, color: tint, opacity: .5 }}>{(g.title || "?")[0]}</span>}
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(to top, rgba(8,6,12,0.96) 0%, rgba(8,6,12,0.72) 22%, rgba(8,6,12,0.12) 48%, rgba(8,6,12,0.28) 100%)" }} />
      <div style={{ position: "absolute", top: 86, left: 20, display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 9px", borderRadius: 99, background: "rgba(20,17,26,0.4)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.14)" }}>
        <span className="pulse" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--accent2)" }} />
        <span style={{ fontSize: 10.5, letterSpacing: 1.5, color: "#fff", fontFamily: "var(--display)", fontWeight: 700 }}>NOW PLAYING</span>
      </div>
      <button onClick={() => onOpen(g)} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 20px 54px", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#fff", width: "100%" }}>
        {player && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "5px 13px 5px 5px", borderRadius: 99, background: player.color + "26", border: `1px solid ${player.color}` }}>
            <span style={{ display: "inline-grid", placeItems: "center", width: 22, height: 22, borderRadius: 99, background: player.color, color: "#0a0612", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11 }}>{player.name[0].toUpperCase()}</span>
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
          {target && <div style={{ height: 9, background: "rgba(255,255,255,0.18)", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: "var(--accent2)", borderRadius: 99 }} /></div>}
        </div>
      </button>
    </div>
  );
}

function DetailView({ game, userById, onClose, onEdit }: { game: Game; userById: (id?: string | null) => Profile | null; onClose: () => void; onEdit: () => void }) {
  const g = game;
  const tint = tintFor(g.platform);
  const addedByUser = userById(g.added_by);
  const ratingColor = g.rating == null ? "var(--ink-dim)" : g.rating >= 85 ? "var(--good)" : g.rating >= 65 ? "var(--accent3)" : "var(--bad)";
  const facts: [string, any][] = [["Developer", g.developer || "—"], ["Publisher", g.publisher || "—"], ["Released", g.year || "—"], ["Genre", g.genre || "—"], ["Condition", g.condition || "—"], ["Region", g.region || "—"]];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }} className="fade">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "94vh", overflowY: "auto", overflowX: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel)", borderBottom: "1px solid var(--line)" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontFamily: "var(--display)", fontSize: 12, fontWeight: 700 }}><ChevronLeft size={17} /> BACK</button>
          <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--accent2)", color: "var(--bg)", border: "none", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12, padding: "8px 14px", borderRadius: "var(--radius)", cursor: "pointer" }}><Pencil size={14} /> EDIT</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 18 }}>
            <div style={{ width: 130, flexShrink: 0 }}><Cover g={g} ratio={1.33} profiles={[]} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 10, fontFamily: "var(--display)", fontWeight: 700, padding: "3px 9px", borderRadius: "var(--radius)", border: `1px solid ${tint}`, color: tint, background: tint + "1a" }}>{g.platform}</span>
              <h1 style={{ fontFamily: "var(--display)", fontSize: 22, lineHeight: 1.18, margin: "11px 0 0", fontWeight: 800 }}>{g.title}</h1>
              {(g.developer || g.publisher) && <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 8 }}>{g.developer}{g.developer && g.publisher && g.developer !== g.publisher ? " · " : ""}{g.publisher !== g.developer ? g.publisher : ""}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                {g.rating != null && <div style={{ display: "inline-flex", alignItems: "baseline", gap: 3, padding: "4px 9px", borderRadius: "var(--radius)", border: `1px solid ${ratingColor}`, background: ratingColor + "1a" }}><span style={{ fontFamily: "var(--display)", fontSize: 13, color: ratingColor }}>{g.rating}</span><span style={{ fontSize: 9, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>/100</span></div>}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "var(--display)", color: g.status === "owned" ? "var(--good)" : "var(--accent)" }}>{g.status === "owned" ? <><Box size={13} /> IN COLLECTION</> : <><Heart size={13} /> WISHLIST</>}</span>
              </div>
            </div>
          </div>

          {g.description && <div style={{ marginTop: 20 }}><div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 7 }}>ABOUT</div><p style={{ fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>{g.description}</p></div>}

          {g.status === "owned" && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 8 }}>WHO&apos;S PLAYED IT</div>
              <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                {(() => {
                  const rows = progressEntries(g).map(([id, p]) => ({ u: userById(id), p, runs: g.playthroughs?.[id] ?? [] }))
                    .filter((r) => r.u && (r.p.status !== "backlog" || r.runs.length))
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
              <div style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>MARKET VALUE</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 5, fontFamily: "var(--display)" }}>{money(g.value_cents)}</div>
            </div>
          </div>

          {g.notes && <div style={{ marginTop: 18 }}><div style={{ fontSize: 9.5, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 6 }}>NOTES</div><div style={{ fontSize: 14, lineHeight: 1.55, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "12px 14px" }}>{g.notes}</div></div>}
          {addedByUser && <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 9 }}><Avatar user={addedByUser} size={22} /><span style={{ fontSize: 12, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>Added by {addedByUser.name}</span></div>}
        </div>
      </div>
    </div>
  );
}

function GameModal({ game, currentUser, platforms, genres, onSave, onDelete, onClose }: { game: Partial<Game>; currentUser: Profile; platforms: string[]; genres: string[]; onSave: (g: any) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const isNew = !game.id;
  const myProg = getProg(game as Game, currentUser.id);
  const [f, setF] = useState<any>({
    title: game.title || "", platform: game.platform || platforms[0] || "PS1", status: game.status || "owned",
    condition: game.condition || "CIB", region: game.region || "PAL", genre: game.genre || genres[0] || "RPG",
    value_eur: game.value_cents ? Math.round(game.value_cents / 100) : "", priority: game.priority || "med",
    notes: game.notes || "", cover: game.cover || "", year: game.year || "",
    developer: game.developer || "", publisher: game.publisher || "", description: game.description || "",
    rating: game.rating ?? null, screenshots: game.screenshots || [], hltb: game.hltb || null,
    igdb_id: game.igdb_id ?? null, id: game.id,
    myStatus: myProg.status, myHours: myProg.hours ?? "",
  });
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "empty">("idle");
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  // Replay handling: completions so far, and whether this edit starts a new run.
  const completions = (game.playthroughs?.[currentUser.id]?.length ?? 0) + (myProg.status === "finished" ? 1 : 0);
  const startingReplay = myProg.status === "finished" && f.myStatus === "playing";
  const pickStatus = (k: string) => {
    // Only matters when the saved run is finished. Switching to playing starts a
    // fresh session (0h); switching back restores the finished run's hours so a
    // toggle doesn't silently wipe them before save.
    if (myProg.status === "finished") set("myHours", k === "playing" ? "" : (myProg.hours ?? ""));
    set("myStatus", k);
  };

  const autoFill = async () => {
    if (!f.title.trim()) return;
    setFetchState("loading");
    try {
      const r = await fetch("/api/metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: f.title.trim() }) });
      const m = await r.json();
      setF((p: any) => ({ ...p, cover: m.cover || p.cover, description: m.description || p.description, developer: m.developer || p.developer, publisher: m.publisher || p.publisher, year: m.year || p.year, genre: genres.includes(m.genre) ? m.genre : p.genre, rating: m.rating ?? p.rating, hltb: m.hltb || p.hltb, screenshots: m.screenshots?.length ? m.screenshots : p.screenshots, igdb_id: m.igdb_id ?? p.igdb_id }));
      setFetchState("done");
    } catch { setFetchState("empty"); }
  };

  const save = () => {
    if (!f.title.trim()) return;
    onSave({
      id: f.id, title: f.title, platform: f.platform, status: f.status, condition: f.condition,
      region: f.region, genre: f.genre, year: Number(f.year) || null, developer: f.developer,
      publisher: f.publisher, rating: f.rating == null ? null : Number(f.rating),
      value_cents: (Number(f.value_eur) || 0) * 100, cover: f.cover, description: f.description,
      screenshots: f.screenshots, hltb: f.hltb, priority: f.priority, notes: f.notes, igdb_id: f.igdb_id,
      myStatus: f.status === "owned" ? f.myStatus : undefined, myHours: Number(f.myHours) || 0,
    });
  };

  const inp: React.CSSProperties = { width: "100%", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "var(--ink)", padding: "10px 12px", fontSize: 14, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 6, display: "block" };
  const Field = ({ label, children }: any) => <div><label style={lbl}>{label}</label>{children}</div>;
  const Select = ({ value, opts, onChange }: any) => <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inp, cursor: "pointer" }}>{opts.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }} className="fade">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "94vh", overflowY: "auto", overflowX: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)" }}>{isNew ? "NEW ENTRY" : "EDIT"}</div>
          <button onClick={onClose} style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>TITLE</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={inp} value={f.title} onChange={(e) => { set("title", e.target.value); setFetchState("idle"); }} placeholder="Game title" autoFocus />
            <button onClick={autoFill} disabled={!f.title.trim() || fetchState === "loading"} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 13px", border: "none", borderRadius: "var(--radius)", cursor: f.title.trim() ? "pointer" : "not-allowed", background: "var(--accent3)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11, opacity: f.title.trim() ? 1 : .5 }}>
              {fetchState === "loading" ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} FILL
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 16, display: "flex", gap: 14 }}>
          <div style={{ width: 88, flexShrink: 0 }}><Cover g={{ ...f, value_cents: 0 } as Game} ratio={1.33} profiles={[]} /></div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={lbl}>BOX ART</label>
            <input style={inp} value={f.cover} onChange={(e) => set("cover", e.target.value)} placeholder="Image URL (or tap FILL)" />
            <span style={{ fontSize: 10, color: fetchState === "empty" ? "var(--bad)" : "var(--ink-dim)", fontFamily: "var(--display)", lineHeight: 1.4 }}>
              {fetchState === "loading" && "Looking up via IGDB + HLTB…"}{fetchState === "done" && "✓ Details filled."}{fetchState === "empty" && "No match. Fill manually."}{fetchState === "idle" && "Tap FILL to auto-fetch."}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>STATUS</label>
          <div style={{ display: "flex", gap: 8 }}>
            {([["owned", "OWNED", Box], ["wishlist", "WISHLIST", Heart]] as const).map(([k, l, Ic]) => (
              <button key={k} onClick={() => set("status", k)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 0", border: `1px solid ${f.status === k ? "var(--accent2)" : "var(--line)"}`, borderRadius: "var(--radius)", cursor: "pointer", background: f.status === k ? "var(--accent2)22" : "var(--bg)", color: f.status === k ? "var(--ink)" : "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12 }}><Ic size={15} /> {l}</button>
            ))}
          </div>
        </div>

        {f.status === "owned" && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>YOUR PLAY STATUS · {currentUser.name}{completions > 0 && <span style={{ color: "var(--good)" }}> · COMPLETED {completions}×</span>}</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {Object.entries(PLAY_STATUS).map(([k, v]) => { const on = f.myStatus === k; return <button key={k} onClick={() => pickStatus(k)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", border: `1px solid ${on ? playColor(k) : "var(--line)"}`, borderRadius: "var(--radius)", cursor: "pointer", background: on ? playColor(k) + "22" : "var(--bg)", color: on ? "var(--ink)" : "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11 }}>{k === "finished" && <Check size={13} strokeWidth={3} />}{v.short}</button>; })}
            </div>
            {startingReplay && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, padding: "9px 11px", borderRadius: "var(--radius)", background: "var(--accent2)1a", border: "1px solid var(--accent2)", fontSize: 11.5, color: "var(--ink)", lineHeight: 1.4 }}>
                <Sparkles size={14} color="var(--accent2)" style={{ flexShrink: 0 }} />
                New playthrough — your finished run ({myProg.hours}h) will be saved to history.
              </div>
            )}
            <label style={lbl}>YOUR HOURS PLAYED{startingReplay && " · NEW SESSION"}</label>
            <input style={inp} type="number" value={f.myHours} onChange={(e) => set("myHours", e.target.value)} placeholder="0" />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="PLATFORM"><Select value={f.platform} opts={platforms} onChange={(v: string) => set("platform", v)} /></Field>
          <Field label="CONDITION"><Select value={f.condition} opts={CONDITIONS} onChange={(v: string) => set("condition", v)} /></Field>
          <Field label="REGION"><Select value={f.region} opts={REGIONS} onChange={(v: string) => set("region", v)} /></Field>
          <Field label="GENRE"><Select value={f.genre} opts={genres} onChange={(v: string) => set("genre", v)} /></Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="DEVELOPER"><input style={inp} value={f.developer} onChange={(e) => set("developer", e.target.value)} placeholder="Konami" /></Field>
          <Field label="PUBLISHER"><input style={inp} value={f.publisher} onChange={(e) => set("publisher", e.target.value)} placeholder="Square Enix" /></Field>
          <Field label="YEAR"><input style={inp} type="number" value={f.year} onChange={(e) => set("year", e.target.value)} placeholder="1998" /></Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="RATING /100"><input style={inp} type="number" value={f.rating ?? ""} onChange={(e) => set("rating", e.target.value === "" ? null : e.target.value)} placeholder="/100" /></Field>
          <Field label="VALUE (€)"><input style={inp} type="number" value={f.value_eur} onChange={(e) => set("value_eur", e.target.value)} placeholder="0" /></Field>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>DESCRIPTION</label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 64 }} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What's this game about?" />
        </div>

        {f.status === "wishlist" && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>PRIORITY</label>
            <div style={{ display: "flex", gap: 8 }}>
              {([["high", "HIGH"], ["med", "MEDIUM"], ["low", "LOW"]] as const).map(([k, l]) => <button key={k} onClick={() => set("priority", k)} style={{ flex: 1, padding: "9px 0", border: `1px solid ${f.priority === k ? "var(--accent3)" : "var(--line)"}`, borderRadius: "var(--radius)", cursor: "pointer", background: f.priority === k ? "var(--accent3)22" : "var(--bg)", color: f.priority === k ? "var(--ink)" : "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11 }}>{l}</button>)}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>NOTES</label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 58 }} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional…" />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {!isNew && <button onClick={() => onDelete(f.id)} style={{ padding: "13px 16px", border: "1px solid var(--bad)", borderRadius: "var(--radius)", cursor: "pointer", background: "transparent", color: "var(--bad)", fontFamily: "var(--display)", fontWeight: 700 }}>DELETE</button>}
          <button onClick={save} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 0", border: "none", borderRadius: "var(--radius)", cursor: "pointer", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 14 }}><Check size={17} strokeWidth={3} /> {isNew ? "ADD TO VAULT" : "SAVE"}</button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ games, platforms, genres, onSave, onClose }: {
  games: Game[]; platforms: string[]; genres: string[];
  onSave: (key: "platforms" | "genres", value: string[]) => void; onClose: () => void;
}) {
  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 8, display: "block" };
  const inp: React.CSSProperties = { flex: 1, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "var(--ink)", padding: "10px 12px", fontSize: 14, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box" };

  // One editable list (platforms or genres), persisted on every change. Items
  // still attached to games can't be removed — that would orphan the value in
  // the dropdowns and stats.
  const EditableList = ({ title, icon: Ic, items, field, usedCount }: {
    title: string; icon: any; items: string[]; field: "platforms" | "genres"; usedCount: (v: string) => number;
  }) => {
    const [draft, setDraft] = useState("");
    const add = () => {
      const v = draft.trim();
      if (!v || items.some((i) => i.toLowerCase() === v.toLowerCase())) { setDraft(""); return; }
      onSave(field, [...items, v]);
      setDraft("");
    };
    const remove = (v: string) => onSave(field, items.filter((i) => i !== v));
    return (
      <div style={{ marginBottom: 22 }}>
        <label style={lbl}><Ic size={12} style={{ verticalAlign: "-2px", marginRight: 6 }} />{title}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {items.map((v) => {
            const n = usedCount(v);
            return (
              <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 6px 6px 11px", borderRadius: 99, border: "1px solid var(--line)", background: "var(--bg)", fontSize: 12.5, fontFamily: "var(--display)", fontWeight: 700 }}>
                {v}
                {n > 0 && <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>{n}</span>}
                <button onClick={() => remove(v)} disabled={n > 0} title={n > 0 ? `In use by ${n} game${n === 1 ? "" : "s"}` : "Remove"}
                  style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: 99, border: "none", cursor: n > 0 ? "not-allowed" : "pointer", background: n > 0 ? "transparent" : "var(--panel-alt)", color: n > 0 ? "var(--ink-dim)" : "var(--ink)", opacity: n > 0 ? 0.4 : 1 }}>
                  <X size={12} />
                </button>
              </span>
            );
          })}
          {!items.length && <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>Nothing yet — add one below.</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={inp} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={`Add ${title.toLowerCase().replace(/s$/, "")}…`} />
          <button onClick={add} disabled={!draft.trim()} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 14px", border: "none", borderRadius: "var(--radius)", cursor: draft.trim() ? "pointer" : "not-allowed", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12, opacity: draft.trim() ? 1 : 0.5 }}>
            <Plus size={15} strokeWidth={3} /> ADD
          </button>
        </div>
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }} className="fade">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "94vh", overflowY: "auto", overflowX: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)" }}>SETTINGS</div>
          <button onClick={onClose} style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.5, marginBottom: 20 }}>
          Curate the dropdown lists shared across your household. Changes save instantly.
        </div>
        <EditableList title="Platforms" icon={Gamepad2} items={platforms} field="platforms" usedCount={(v) => games.filter((g) => g.platform === v).length} />
        <EditableList title="Genres" icon={Library} items={genres} field="genres" usedCount={(v) => games.filter((g) => g.genre === v).length} />
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
  resolve: (upc: string) => Promise<{ title: string | null; error?: string }>;
  onResolved: (title: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const lastFailedRef = useRef("");
  const audioRef = useRef<AudioContext | null>(null);
  const [phase, setPhase] = useState<"scanning" | "looking" | "notfound" | "error">("scanning");
  const [note, setNote] = useState("");
  const [manual, setManual] = useState("");

  // Short confirmation beep (synthesised, no asset) + a haptic buzz on phones,
  // fired the instant a barcode is decoded — the "got it" feedback.
  const beep = () => {
    const ctx = audioRef.current;
    if (ctx) {
      try {
        ctx.resume?.();
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
      if (r?.title) { onResolved(r.title); return; }
      lastFailedRef.current = code; // don't loop-beep the same unmatched barcode
      setNote(
        r?.error === "rate_limited" ? "Daily lookup limit reached — type the title below instead." :
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
      if (Ctx) { audioRef.current = new Ctx(); audioRef.current.resume?.(); }
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000d", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 80 }} className="fade">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
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
