"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, X, TrendingUp, Swords, Compass, Library, Lock, type LucideIcon } from "lucide-react";
import type { AchievementUnlock, Profile } from "@/lib/types";
import {
  ACHIEVEMENTS, evaluateAchievement, rarityScore, matchesFilter, sortAchievements,
  categoryOf, CATEGORY_META,
  type AchievementCategory, type AchievementFilter, type AchievementSort, type UserStats,
} from "@/lib/achievements";
import { AchievementTile } from "@/components/achievements/AchievementTile";
import { AchievementDetailSheet } from "@/components/achievements/AchievementDetailSheet";

const FILTERS: [AchievementFilter, string][] = [
  ["all", "All"], ["in_progress", "In progress"], ["almost", "Almost there"], ["completed", "Completed"], ["locked", "Locked"],
];
const SORTS: [AchievementSort, string][] = [["progress", "Progress"], ["points", "Points"], ["rarity", "Rarity"]];
const CAT_ICONS: Record<string, LucideIcon> = { TrendingUp, Swords, Compass, Library, Lock };

// The achievement grid, grouped into collapsible category sections so the long
// catalog stays scannable. Status filter + sort apply within every section; a
// non-"all" filter auto-expands sections and hides empty ones. `readOnly` (a
// member's grid) drops the controls and starts fully expanded.
export function AchievementGrid({ stats, statsByUser, profiles, unlocks, currentUserId, justUnlocked, readOnly }: {
  stats: UserStats | undefined;
  statsByUser: Map<string, UserStats>;
  profiles: Profile[];
  unlocks: AchievementUnlock[];
  currentUserId: string;
  justUnlocked?: Set<string>;
  readOnly?: boolean;
}) {
  const [filter, setFilter] = useState<AchievementFilter>("all");
  const [sort, setSort] = useState<AchievementSort>("progress");
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<AchievementCategory>>(() => new Set());

  // First paint renders progress bars at 0; flip mounted on so they grow in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);

  const rows = useMemo(() =>
    ACHIEVEMENTS.map((def) => ({ def, p: evaluateAchievement(def, stats), rarity: rarityScore(def, statsByUser, profiles), cat: categoryOf(def) })),
    [stats, statsByUser, profiles]);

  // One entry per category (in CATEGORY_META order), with its filtered+sorted
  // rows and an at-a-glance summary computed over ALL of the category's rows.
  const groups = useMemo(() => CATEGORY_META.map((meta) => {
    const all = rows.filter((r) => r.cat === meta.id);
    const filtered = sortAchievements(all.filter((r) => matchesFilter(r.p, filter)), sort);
    return {
      meta, filtered,
      total: all.length,
      completed: all.filter((r) => r.p.nextStep === null).length,
      earned: all.reduce((n, r) => n + r.p.points, 0),
      max: all.reduce((n, r) => n + r.p.maxPoints, 0),
    };
  }).filter((g) => g.total > 0), [rows, filter, sort]);

  const open = openId ? rows.find((r) => r.def.id === openId) : null;
  const filterActive = filter !== "all";
  const dirty = filter !== "all" || sort !== "progress";
  const totalShown = groups.reduce((n, g) => n + g.filtered.length, 0);
  const toggle = (id: AchievementCategory) =>
    setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allOpen = !readOnly && CATEGORY_META.every((m) => expanded.has(m.id));
  const setAll = (openState: boolean) => setExpanded(openState ? new Set(CATEGORY_META.map((m) => m.id)) : new Set());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!readOnly && (
        <>
          <div className="filter-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Filter label="SHOW" value={filter} onChange={(v) => setFilter(v as AchievementFilter)} options={FILTERS} />
            <Filter label="SORT BY" value={sort} onChange={(v) => setSort(v as AchievementSort)} options={SORTS} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 2 }}>
            <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{totalShown} {totalShown === 1 ? "achievement" : "achievements"}</span>
            <button onClick={() => setAll(!allOpen)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontFamily: "var(--display)", fontSize: 11, fontWeight: 700 }}>
              {allOpen ? "COLLAPSE ALL" : "EXPAND ALL"}
            </button>
            {dirty && (
              <button onClick={() => { setFilter("all"); setSort("progress"); }} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontFamily: "var(--display)", fontSize: 11, fontWeight: 700 }}>
                <X size={12} /> RESET
              </button>
            )}
          </div>
        </>
      )}

      {groups.map((g) => {
        // Under an active filter, force-open and skip categories with no matches.
        if (filterActive && g.filtered.length === 0) return null;
        const isOpen = filterActive || expanded.has(g.meta.id);
        const CatIcon = CAT_ICONS[g.meta.icon] ?? Library;
        const pct = g.max > 0 ? (g.earned / g.max) * 100 : 0;
        return (
          <section key={g.meta.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => !filterActive && toggle(g.meta.id)} aria-expanded={isOpen}
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", font: "inherit", color: "var(--ink)", padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--panel)", border: "1px solid var(--line)", cursor: filterActive ? "default" : "pointer" }}>
              <CatIcon size={16} color="var(--accent2)" />
              <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>{g.meta.label}</span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "var(--display)", fontSize: 11, color: "var(--ink-dim)" }}>{g.completed}/{g.total}</span>
                <div style={{ width: 54, height: 5, background: "var(--bg)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--line)" }}>
                  <div style={{ height: "100%", width: `${mounted ? pct : 0}%`, background: "var(--accent2)", borderRadius: 99, transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
                </div>
                {!filterActive && <ChevronDown size={16} color="var(--ink-dim)" style={{ transition: "transform .3s ease", transform: isOpen ? "rotate(180deg)" : "none" }} />}
              </div>
            </button>

            {isOpen && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                {g.filtered.map(({ def, p }) => {
                  const canOpen = !readOnly && !(def.hidden && p.stepsUnlocked === 0);
                  return (
                    <AchievementTile key={def.id} def={def} progress={p} mounted={mounted}
                      justUnlocked={justUnlocked?.has(def.id)}
                      onClick={canOpen ? () => setOpenId(def.id) : undefined} />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {!readOnly && totalShown === 0 && (
        <div style={{ textAlign: "center", padding: "36px 0", color: "var(--ink-dim)", fontSize: 13 }}>No achievements match this filter.</div>
      )}

      {open && (
        <AchievementDetailSheet def={open.def} progress={open.p} statsByUser={statsByUser} profiles={profiles}
          unlocks={unlocks} currentUserId={currentUserId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

// Compact select matching the collection/upcoming FilterField. Kept local so the
// achievements components stay self-contained (no circular import into VaultApp).
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
