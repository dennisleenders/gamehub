"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import type { AchievementUnlock, Profile } from "@/lib/types";
import {
  ACHIEVEMENTS, evaluateAchievement, rarityScore, matchesFilter, sortAchievements,
  type AchievementFilter, type AchievementSort, type AchievementDef, type UserStats,
} from "@/lib/achievements";
import { AchievementTile } from "@/components/achievements/AchievementTile";
import { AchievementDetailSheet } from "@/components/achievements/AchievementDetailSheet";

const FILTERS: [AchievementFilter, string][] = [
  ["all", "All"], ["in_progress", "In progress"], ["almost", "Almost there"], ["completed", "Completed"], ["locked", "Locked"],
];
const SORTS: [AchievementSort, string][] = [["progress", "Progress"], ["points", "Points"], ["rarity", "Rarity"]];

// The achievement grid + its filter/sort controls and the tap-through detail
// sheet. Achievements are computed live from the passed-in stats; statsByUser +
// profiles power per-tier household coverage / rarity. `readOnly` renders a
// member's grid (no detail sheet, no clicks).
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

  // First paint renders progress bars at 0; flip mounted on so they grow in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);

  const rows = useMemo(() =>
    ACHIEVEMENTS.map((def) => ({ def, p: evaluateAchievement(def, stats), rarity: rarityScore(def, statsByUser, profiles) })),
    [stats, statsByUser, profiles]);

  const visible = useMemo(() => sortAchievements(rows.filter((r) => matchesFilter(r.p, filter)), sort), [rows, filter, sort]);

  const open = openId ? rows.find((r) => r.def.id === openId) : null;
  const reset = () => { setFilter("all"); setSort("progress"); };
  const dirty = filter !== "all" || sort !== "progress";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!readOnly && (
        <>
          <div className="filter-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Filter label="SHOW" value={filter} onChange={(v) => setFilter(v as AchievementFilter)} options={FILTERS} />
            <Filter label="SORT BY" value={sort} onChange={(v) => setSort(v as AchievementSort)} options={SORTS} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 2 }}>
            <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>{visible.length} {visible.length === 1 ? "achievement" : "achievements"}</span>
            {dirty && (
              <button onClick={reset} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontFamily: "var(--display)", fontSize: 11, fontWeight: 700 }}>
                <X size={12} /> RESET
              </button>
            )}
          </div>
        </>
      )}

      {visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 0", color: "var(--ink-dim)", fontSize: 13 }}>No achievements match this filter.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {visible.map(({ def, p }) => {
            const canOpen = !readOnly && !(def.hidden && p.stepsUnlocked === 0);
            return (
              <AchievementTile key={def.id} def={def} progress={p} mounted={mounted}
                justUnlocked={justUnlocked?.has(def.id)}
                onClick={canOpen ? () => setOpenId(def.id) : undefined} />
            );
          })}
        </div>
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
